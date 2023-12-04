import type { CodeInformation, Mapping, Stack, VirtualFile } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
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
	DocumentDrop_DataTransferItemFileDataRequest
} from '../../protocol';
import type { ServerProjectProvider, ServerRuntimeEnvironment } from '../types';
import type { DataTransferItem } from '@volar/language-service';

export function registerEditorFeatures(
	connection: vscode.Connection,
	projectProvider: ServerProjectProvider,
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

		const languageService = (await projectProvider.getProject(textDocument.uri)).getLanguageService();
		return languageService.doDocumentDrop(textDocument.uri, position, dataTransferMap, token);
	});
	connection.onRequest(GetMatchTsConfigRequest.type, async params => {
		const languageService = (await projectProvider.getProject(params.uri)).getLanguageService();
		const configFileName = languageService.context.project.typescript?.configFileName;
		if (configFileName) {
			return { uri: env.fileNameToUri(configFileName) };
		}
	});
	connection.onRequest(GetVirtualFilesRequest.type, async document => {
		const languageService = (await projectProvider.getProject(document.uri)).getLanguageService();
		const virtualFile = languageService.context.project.files.getSourceFile(document.uri)?.virtualFile;
		return virtualFile ? prune(virtualFile[0]) : undefined;

		function prune(file: VirtualFile): VirtualFile {
			let version = scriptVersions.get(file.id) ?? 0;
			if (!scriptVersionSnapshots.has(file.snapshot)) {
				version++;
				scriptVersions.set(file.id, version);
				scriptVersionSnapshots.add(file.snapshot);
			}
			return {
				id: file.id,
				languageId: file.languageId,
				typescript: file.typescript,
				embeddedFiles: file.embeddedFiles.map(prune),
				// @ts-expect-error
				version,
			};
		}
	});
	connection.onRequest(GetVirtualFileRequest.type, async params => {
		const languageService = (await projectProvider.getProject(params.sourceFileUri)).getLanguageService();
		let content: string = '';
		let codegenStacks: Stack[] = [];
		const mappings: Record<string, Mapping<CodeInformation>[]> = {};
		const [virtualFile] = languageService.context.project.files.getVirtualFile(env.fileNameToUri(params.virtualFileName));
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
		projectProvider.reloadProjects();
	});
	connection.onNotification(WriteVirtualFilesNotification.type, async params => {

		const fsModeName = 'fs'; // avoid bundle
		const fs: typeof import('fs') = await import(fsModeName);
		const languageService = (await projectProvider.getProject(params.uri)).getLanguageService();

		if (languageService.context.project.typescript?.languageServiceHost) {

			const rootUri = languageService.context.env.workspaceFolder.uri.toString();
			const { languageServiceHost } = languageService.context.project.typescript;

			for (const fileName of languageServiceHost.getScriptFileNames()) {
				if (!fs.existsSync(fileName)) {
					// global virtual files
					const snapshot = languageServiceHost.getScriptSnapshot(fileName);
					if (snapshot) {
						fs.writeFile(fileName, snapshot.getText(0, snapshot.getLength()), () => { });
					}
				}
				else {
					const uri = languageService.context.env.fileNameToUri(fileName);
					const [virtualFile] = languageService.context.project.files.getVirtualFile(uri);
					if (virtualFile?.typescript && virtualFile.id.startsWith(rootUri)) {
						const { snapshot } = virtualFile;
						fs.writeFile(languageService.context.env.uriToFileName(virtualFile.id), snapshot.getText(0, snapshot.getLength()), () => { });
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

		for (const project of await projectProvider.getProjects()) {
			const languageService = project.getLanguageService();
			const tsLanguageService: ts.LanguageService | undefined = languageService.context.inject('typescript/languageService');
			const program = tsLanguageService?.getProgram();
			if (program && languageService.context.project.typescript) {
				const { configFileName, languageServiceHost } = languageService.context.project.typescript;
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
}
