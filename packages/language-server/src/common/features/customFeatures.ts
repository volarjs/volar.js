import * as vscode from 'vscode-languageserver';
import type { Workspaces } from '../workspaces';
import { GetMatchTsConfigRequest, ReloadProjectNotification, GetVirtualFileRequest, GetProjectsRequest, GetProjectFilesRequest, GetVirtualFilesRequest, WriteVirtualFilesNotification } from '../../protocol';
import { RuntimeEnvironment } from '../../types';
import { FileKind, VirtualFile, forEachEmbeddedFile } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';

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
	connection.onRequest(GetProjectsRequest.type, async (params) => {
		const matchProject = params ? (await workspaces.getProject(params.uri)) : undefined;
		const result: GetProjectsRequest.ResponseType = [];
		for (const [workspaceUri, _workspace] of workspaces.workspaces) {
			const workspace = (await _workspace);
			result.push({
				isInferredProject: true,
				rootUri: workspaceUri,
				tsconfig: undefined,
				created: !!workspace.getInferredProjectDontCreate(),
				isSelected: !!matchProject && await workspace.getInferredProjectDontCreate() === matchProject.project,
			});
			for (const _project of workspace.projects.values()) {
				const project = await _project;
				result.push({
					isInferredProject: false,
					rootUri: workspaceUri,
					tsconfig: project.tsConfig as string,
					created: !!project.getLanguageServiceDontCreate(),
					isSelected: !!matchProject && project === matchProject.project,
				});
			}
		}
		return result;
	});
	connection.onRequest(GetProjectFilesRequest.type, async (params) => {
		const workspace = await workspaces.workspaces.get(params.rootUri);
		if (!workspace) return [];
		if (!params.tsconfig) {
			const project = await workspace.getInferredProject();
			if (!project) return [];
			return project.projectHost.getScriptFileNames();
		}
		for (const _project of workspace.projects.values()) {
			const project = await _project;
			if (project.tsConfig === params.tsconfig) {
				return project.projectHost.getScriptFileNames();
			}
		}
		return [];
	});
	connection.onRequest(GetVirtualFilesRequest.type, async document => {
		const project = await workspaces.getProject(document.uri);
		if (project) {
			const file = (await project.project?.getLanguageService())?.context.virtualFiles.getSource(env.uriToFileName(document.uri))?.root;
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
		if (project) {
			const [virtualFile, source] = (await project.project?.getLanguageService())?.context.virtualFiles.getVirtualFile(params.virtualFileName) ?? [];
			if (virtualFile && source) {
				const mappings: Record<string, any[]> = {};
				for (const mapping of virtualFile.mappings) {
					const sourceUri = env.fileNameToUri(mapping.source ?? source.fileName);
					mappings[sourceUri] ??= [];
					mappings[sourceUri].push(mapping);
				}
				return {
					content: virtualFile.snapshot.getText(0, virtualFile.snapshot.getLength()),
					mappings,
					codegenStacks: virtualFile.codegenStacks,
				};
			}
		}
	});
	connection.onNotification(ReloadProjectNotification.type, () => {
		workspaces.reloadProject();
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
}
