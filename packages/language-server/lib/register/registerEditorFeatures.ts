import { forEachEmbeddedFile, type CodeMapping, type Stack, type VirtualFile } from '@volar/language-core';
import type * as ts from 'typescript';
import type * as vscode from 'vscode-languageserver';
import {
	GetMatchTsConfigRequest,
	GetVirtualFileRequest,
	GetVirtualFilesRequest,
	LoadedTSFilesMetaRequest,
	ReloadProjectNotification,
	WriteVirtualFilesNotification,
	DocumentDropRequest,
	DocumentDrop_DataTransferItemAsStringRequest,
	DocumentDrop_DataTransferItemFileDataRequest,
	UpdateVirtualFileStateNotification,
	UpdateServicePluginStateNotification,
	GetServicePluginsRequest,
} from '../../protocol';
import type { ServerProjectProvider, ServerRuntimeEnvironment } from '../types';
import type { DataTransferItem } from '@volar/language-service';

export function registerEditorFeatures(
	connection: vscode.Connection,
	projects: ServerProjectProvider,
	env: ServerRuntimeEnvironment,
) {

	const scriptVersions = new Map<string, number>();
	const scriptVersionSnapshots = new WeakSet<ts.IScriptSnapshot>();

	connection.onRequest(DocumentDropRequest.type, async ({ textDocument, position, dataTransfer }, token) => {

		const dataTransferMap = new Map<string, DataTransferItem>();

		for (const item of dataTransfer) {
			dataTransferMap.set(item.mimeType, {
				value: item.value,
				asString() {
					return connection.sendRequest(DocumentDrop_DataTransferItemAsStringRequest.type, { mimeType: item.mimeType });
				},
				asFile() {
					if (item.file) {
						return {
							name: item.file.name,
							uri: item.file.uri,
							data() {
								return connection.sendRequest(DocumentDrop_DataTransferItemFileDataRequest.type, { mimeType: item.mimeType });
							},
						};
					}
				},
			});
		}

		const languageService = (await projects.getProject(textDocument.uri)).getLanguageService();
		return languageService.doDocumentDrop(textDocument.uri, position, dataTransferMap, token);
	});
	connection.onRequest(GetMatchTsConfigRequest.type, async params => {
		const languageService = (await projects.getProject(params.uri)).getLanguageService();
		const configFileName = languageService.context.language.typescript?.configFileName;
		if (configFileName) {
			return { uri: env.fileNameToUri(configFileName) };
		}
	});
	connection.onRequest(GetVirtualFilesRequest.type, async document => {
		const languageService = (await projects.getProject(document.uri)).getLanguageService();
		const virtualFile = languageService.context.language.files.getSourceFile(document.uri)?.generated?.virtualFile;
		return virtualFile ? prune(virtualFile) : undefined;

		function prune(file: VirtualFile): GetVirtualFilesRequest.VirtualFileWithState {
			const uri = languageService.context.documents.getVirtualFileUri(file);
			let version = scriptVersions.get(uri) ?? 0;
			if (!scriptVersionSnapshots.has(file.snapshot)) {
				version++;
				scriptVersions.set(uri, version);
				scriptVersionSnapshots.add(file.snapshot);
			}
			return {
				uri,
				languageId: file.languageId,
				tsScriptKind: file.typescript?.scriptKind,
				embeddedFiles: file.embeddedFiles.map(prune),
				version,
				disabled: languageService.context.disabledVirtualFileUris.has(uri),
			};
		}
	});
	connection.onRequest(GetVirtualFileRequest.type, async params => {
		const languageService = (await projects.getProject(params.sourceFileUri)).getLanguageService();
		let content: string = '';
		let codegenStacks: Stack[] = [];
		const mappings: Record<string, CodeMapping[]> = {};
		const [virtualFile] = languageService.context.documents.getVirtualFileByUri(params.virtualFileUri);
		if (virtualFile) {
			for (const map of languageService.context.documents.getMaps(virtualFile)) {
				content = map.virtualFileDocument.getText();
				codegenStacks = virtualFile.codegenStacks ?? [];
				mappings[map.sourceFileDocument.uri] = map.map.mappings;
			}
		}
		return {
			content,
			mappings,
			codegenStacks,
		};
	});
	connection.onNotification(ReloadProjectNotification.type, () => {
		projects.reloadProjects();
	});
	connection.onNotification(WriteVirtualFilesNotification.type, async params => {

		const fsModeName = 'fs'; // avoid bundle
		const fs: typeof import('fs') = await import(fsModeName);
		const languageService = (await projects.getProject(params.uri)).getLanguageService();

		if (languageService.context.language.typescript?.languageServiceHost) {

			const rootUri = languageService.context.env.workspaceFolder.toString();
			const { languageServiceHost, projectHost } = languageService.context.language.typescript;

			for (const fileName of languageServiceHost.getScriptFileNames()) {
				if (!fs.existsSync(fileName)) {
					// global virtual files
					const snapshot = languageServiceHost.getScriptSnapshot(fileName);
					if (snapshot) {
						fs.writeFile(fileName, snapshot.getText(0, snapshot.getLength()), () => { });
					}
				}
				else {
					const uri = projectHost.fileNameToUri(fileName);
					const sourceFile = languageService.context.language.files.getSourceFile(uri);
					if (sourceFile?.generated?.virtualFile && uri.startsWith(rootUri)) {
						for (const virtualFile of forEachEmbeddedFile(sourceFile.generated.virtualFile)) {
							if (virtualFile.typescript) {
								const { snapshot } = virtualFile;
								fs.writeFile(uri + virtualFile.typescript.extension, snapshot.getText(0, snapshot.getLength()), () => { });
							}
						}
					}
				}
			}
		}
	});
	connection.onRequest(LoadedTSFilesMetaRequest.type, async () => {

		const sourceFilesData = new Map<ts.SourceFile, {
			projectNames: string[];
			size: number;
		}>();

		for (const project of await projects.getProjects()) {
			const languageService = project.getLanguageService();
			const tsLanguageService: ts.LanguageService | undefined = languageService.context.inject<any>('typescript/languageService');
			const program = tsLanguageService?.getProgram();
			if (program && languageService.context.language.typescript) {
				const { configFileName, languageServiceHost } = languageService.context.language.typescript;
				const projectName = configFileName ?? (languageServiceHost.getCurrentDirectory() + '(inferred)');
				const sourceFiles = program.getSourceFiles() ?? [];
				for (const sourceFile of sourceFiles) {
					if (!sourceFilesData.has(sourceFile)) {
						let nodes = 0;
						sourceFile.forEachChild(function walk(node) {
							nodes++;
							node.forEachChild(walk);
						});
						sourceFilesData.set(sourceFile, {
							projectNames: [],
							size: nodes * 128,
						});
					}
					sourceFilesData.get(sourceFile)!.projectNames.push(projectName);
				};
			}
		}

		const result: {
			inputs: {};
			outputs: Record<string, {
				imports: string[];
				exports: string[];
				entryPoint: string;
				inputs: Record<string, { bytesInOutput: number; }>;
				bytes: number;
			}>;
		} = {
			inputs: {},
			outputs: {},
		};

		for (const [sourceFile, fileData] of sourceFilesData) {
			let key = fileData.projectNames.sort().join(', ');
			if (fileData.projectNames.length >= 2) {
				key = `Shared in ${fileData.projectNames.length} projects (${key})`;
			}
			result.outputs[key] ??= {
				imports: [],
				exports: [],
				entryPoint: '',
				inputs: {},
				bytes: 0,
			};
			result.outputs[key].inputs[sourceFile.fileName] = { bytesInOutput: fileData.size };
		}

		return result;
	});
	connection.onNotification(UpdateVirtualFileStateNotification.type, async params => {
		const project = await projects.getProject(params.uri);
		const context = project.getLanguageServiceDontCreate()?.context;
		if (context) {
			if (params.disabled) {
				context.disabledVirtualFileUris.add(params.virtualFileUri);
			}
			else {
				context.disabledVirtualFileUris.delete(params.virtualFileUri);
			}
		}
	});
	connection.onNotification(UpdateServicePluginStateNotification.type, async params => {
		const project = await projects.getProject(params.uri);
		const context = project.getLanguageServiceDontCreate()?.context;
		if (context) {
			const service = context.services[params.serviceId as any][1];
			if (params.disabled) {
				context.disabledServicePlugins.add(service);
			}
			else {
				context.disabledServicePlugins.delete(service);
			}
		}
	});
	connection.onRequest(GetServicePluginsRequest.type, async params => {
		const project = await projects.getProject(params.uri);
		const context = project.getLanguageServiceDontCreate()?.context;
		if (context) {
			const result: GetServicePluginsRequest.ResponseType = [];
			for (let id in context.services) {
				const service = context.services[id];
				result.push({
					id,
					name: service[0].name,
					disabled: context.disabledServicePlugins.has(service[1]),
					features: Object.keys(service[1]),
				});
			}
			return result;
		}
	});
}
