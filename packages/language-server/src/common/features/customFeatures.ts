import { FileKind, FileRangeCapabilities, VirtualFile, forEachEmbeddedFile } from '@volar/language-core';
import { Mapping, Stack } from '@volar/source-map';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver';
import { GetMatchTsConfigRequest, GetVirtualFileRequest, GetVirtualFilesRequest, LoadedTSFilesMetaRequest, ReloadProjectNotification, WriteVirtualFilesNotification } from '../../protocol';
import { RuntimeEnvironment } from '../../types';
import type { Workspaces } from '../workspaces';

export function register(
	connection: vscode.Connection,
	workspaces: Workspaces,
	env: RuntimeEnvironment,
) {

	const scriptVersions = new Map<string, number>();
	const scriptVersionSnapshots = new WeakSet<ts.IScriptSnapshot>();

	connection.onRequest(GetMatchTsConfigRequest.type, async params => {
		const project = (await workspaces.getProject(params.uri));
		if (project?.tsconfig) {
			return { uri: env.fileNameToUri(project.tsconfig) };
		}
	});
	connection.onRequest(GetVirtualFilesRequest.type, async document => {
		const project = await workspaces.getProject(document.uri);
		if (project) {
			const file = project.project?.getLanguageService()?.context.virtualFiles.getSource(env.uriToFileName(document.uri))?.root;
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
		}
	});
	connection.onRequest(GetVirtualFileRequest.type, async params => {
		const project = await workspaces.getProject(params.sourceFileUri);
		const service = project?.project?.getLanguageService();
		if (service) {
			let content: string = '';
			let codegenStacks: Stack[] = [];
			const mappings: Record<string, Mapping<FileRangeCapabilities>[]> = {};
			for (const [file, map] of service.context.documents.getMapsByVirtualFileName(params.virtualFileName)) {
				content = map.virtualFileDocument.getText();
				codegenStacks = file.codegenStacks;
				mappings[map.sourceFileDocument.uri] = map.map.mappings;
			}
			return {
				content,
				mappings,
				codegenStacks,
			};
		}
	});
	connection.onNotification(ReloadProjectNotification.type, () => {
		workspaces.reloadProjects();
	});
	connection.onNotification(WriteVirtualFilesNotification.type, async params => {

		const fs = await import('fs');
		const project = await workspaces.getProject(params.uri);

		if (project) {
			const ls = (await project.project)?.getLanguageServiceDontCreate();
			if (ls) {
				const rootPath = ls.context.env.uriToFileName(ls.context.env.rootUri.toString());
				for (const { root } of ls.context.virtualFiles.allSources()) {
					forEachEmbeddedFile(root, virtualFile => {
						if (virtualFile.kind === FileKind.TypeScriptHostFile) {
							if (virtualFile.fileName.startsWith(rootPath)) {
								const snapshot = virtualFile.snapshot;
								fs.writeFile(virtualFile.fileName, snapshot.getText(0, snapshot.getLength()), () => { });
							}
						}
					});
				}
				// global virtual files
				for (const fileName of ls.context.host.getScriptFileNames()) {
					if (!fs.existsSync(fileName)) {
						const snapshot = ls.context.host.getScriptSnapshot(fileName);
						if (snapshot) {
							fs.writeFile(fileName, snapshot.getText(0, snapshot.getLength()), () => { });
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

		for (const _project of [...workspaces.configProjects.values(), ...workspaces.inferredProjects.values()]) {
			const project = await _project;
			const service = project.getLanguageServiceDontCreate();
			const languageService: ts.LanguageService | undefined = service?.context.inject('typescript/languageService');
			const program = languageService?.getProgram();
			if (program) {
				const projectName = typeof project.tsConfig === 'string' ? project.tsConfig : (project.languageHost.workspacePath + '(inferred)');
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
