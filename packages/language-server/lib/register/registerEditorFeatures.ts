import { FileKind, FileRangeCapabilities, VirtualFile, forEachEmbeddedFile } from '@volar/language-core';
import { Mapping, Stack } from '@volar/source-map';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver';
import { GetMatchTsConfigRequest, GetVirtualFileRequest, GetVirtualFilesRequest, LoadedTSFilesMetaRequest, ReloadProjectNotification, WriteVirtualFilesNotification } from '../../protocol';
import { ServerProjectProvider, ServerRuntimeEnvironment } from '../types';

export function registerEditorFeatures(
	connection: vscode.Connection,
	projectProvider: ServerProjectProvider,
	env: ServerRuntimeEnvironment,
) {

	const scriptVersions = new Map<string, number>();
	const scriptVersionSnapshots = new WeakSet<ts.IScriptSnapshot>();

	connection.onRequest(GetMatchTsConfigRequest.type, async params => {
		const languageService = (await projectProvider.getProject(params.uri)).getLanguageService();
		const projectHost = languageService.context.project.typeScriptProjectHost;
		if (projectHost?.configFileName) {
			return { uri: env.fileNameToUri(projectHost.configFileName) };
		}
	});
	connection.onRequest(GetVirtualFilesRequest.type, async document => {
		const languageService = (await projectProvider.getProject(document.uri)).getLanguageService();
		const file = languageService.context.project.fileProvider.getSource(env.uriToFileName(document.uri))?.root;
		return file ? prune(file) : undefined;

		function prune(file: VirtualFile): VirtualFile {
			let version = scriptVersions.get(file.fileName) ?? 0;
			if (!scriptVersionSnapshots.has(file.snapshot)) {
				version++;
				scriptVersions.set(file.fileName, version);
				scriptVersionSnapshots.add(file.snapshot);
			}
			return {
				fileName: file.fileName,
				kind: file.kind,
				capabilities: file.capabilities,
				embeddedFiles: file.embeddedFiles.map(prune),
				version,
			} as any;
		}
	});
	connection.onRequest(GetVirtualFileRequest.type, async params => {
		const languageService = (await projectProvider.getProject(params.sourceFileUri)).getLanguageService();
		let content: string = '';
		let codegenStacks: Stack[] = [];
		const mappings: Record<string, Mapping<FileRangeCapabilities>[]> = {};
		for (const [file, map] of languageService.context.documents.getMapsByVirtualFileName(params.virtualFileName)) {
			content = map.virtualFileDocument.getText();
			codegenStacks = file.codegenStacks;
			mappings[map.sourceFileDocument.uri] = map.map.mappings;
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

		// global virtual files
		if (languageService.context.project.typeScriptProjectHost) {

			const rootPath = languageService.context.project.typeScriptProjectHost.getCurrentDirectory();

			for (const [fileName] of languageService.context.project.fileProvider.sourceFiles) {
				const source = languageService.context.project.fileProvider.getSource(fileName);
				if (source?.root) {
					forEachEmbeddedFile(source.root, virtualFile => {
						if (virtualFile.kind === FileKind.TypeScriptHostFile) {
							if (virtualFile.fileName.startsWith(rootPath)) {
								const snapshot = virtualFile.snapshot;
								fs.writeFile(virtualFile.fileName, snapshot.getText(0, snapshot.getLength()), () => { });
							}
						}
					});
				}
			}
			for (const fileName of languageService.context.project.typeScriptProjectHost.getScriptFileNames()) {
				if (!fs.existsSync(fileName)) {
					const snapshot = languageService.context.project.typeScriptProjectHost.getScriptSnapshot(fileName);
					if (snapshot) {
						fs.writeFile(fileName, snapshot.getText(0, snapshot.getLength()), () => { });
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
			if (program && languageService.context.project.typeScriptProjectHost) {
				const projectName = languageService.context.project.typeScriptProjectHost.configFileName ?? (languageService.context.project.typeScriptProjectHost.getCurrentDirectory() + '(inferred)');
				const sourceFiles = program?.getSourceFiles() ?? [];
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
