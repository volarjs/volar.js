import * as vscode from 'vscode-languageserver';
import type { Workspaces } from '../workspaces';
import { GetMatchTsConfigRequest, ReloadProjectNotification, WriteVirtualFilesNotification, GetVirtualFilesRequest, GetVirtualFileRequest, ReportStats, GetProjectsRequest, GetProjectFilesRequest } from '../../protocol';
import { RuntimeEnvironment } from '../../types';
import { VirtualFile } from '@volar/language-core';

export function register(
	connection: vscode.Connection,
	workspaces: Workspaces,
	env: RuntimeEnvironment,
) {
	connection.onNotification(ReportStats.type, async () => {
		for (const [rootUri, _workspace] of workspaces.workspaces) {

			connection.console.log('workspace: ' + rootUri);
			const workspace = await _workspace;

			connection.console.log('documentRegistry stats: ' + workspace.documentRegistry?.reportStats());
			connection.console.log('');

			connection.console.log('tsconfig: inferred');
			const _inferredProject = workspace.getInferredProjectDontCreate();
			if (_inferredProject) {
				connection.console.log('loaded: true');
				const inferredProject = await _inferredProject;
				connection.console.log('largest 10 files:');
				for (const script of [...inferredProject.scripts.values()]
					.sort((a, b) => (b.snapshot?.getLength() ?? 0) - (a.snapshot?.getLength() ?? 0))
					.slice(0, 10)
				) {
					connection.console.log('  - ' + script.fileName);
					connection.console.log(`    size: ${script.snapshot?.getLength()}`);
				}
				connection.console.log('files:');
				for (const script of inferredProject.scripts.values()) {
					connection.console.log('  - ' + script.fileName);
					connection.console.log(`    size: ${script.snapshot?.getLength()}`);
					connection.console.log(`    ref counts: "${(workspace.documentRegistry as any).getLanguageServiceRefCounts?.(script.fileName, inferredProject.languageServiceHost.getScriptKind?.(script.fileName))})"`);
				}
			}
			else {
				connection.console.log('loaded: false');
			}
			connection.console.log('');

			for (const _project of workspace.projects.values()) {
				const project = await _project;
				connection.console.log('tsconfig: ' + project.tsConfig);
				connection.console.log('loaded: ' + !!project.getLanguageServiceDontCreate());
				connection.console.log('largest 10 files:');
				for (const script of [...project.scripts.values()]
					.sort((a, b) => (b.snapshot?.getLength() ?? 0) - (a.snapshot?.getLength() ?? 0))
					.slice(0, 10)
				) {
					connection.console.log('  - ' + script.fileName);
					connection.console.log(`    size: ${script.snapshot?.getLength()}`);
				}
				connection.console.log('files:');
				for (const script of project.scripts.values()) {
					connection.console.log('  - ' + script.fileName);
					connection.console.log(`    size: ${script.snapshot?.getLength()}`);
					connection.console.log(`    ref counts: "${(workspace.documentRegistry as any).getLanguageServiceRefCounts?.(script.fileName, project.languageServiceHost.getScriptKind?.(script.fileName))})"`);
				}
			}
			connection.console.log('');
		}
	});
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
			})
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
			return project.languageServiceHost.getScriptFileNames();
		}
		for (const _project of workspace.projects.values()) {
			const project = await _project;
			if (project.tsConfig === params.tsconfig) {
				return project.languageServiceHost.getScriptFileNames();
			}
		}
		return [];
	});
	connection.onRequest(GetVirtualFilesRequest.type, async document => {
		const project = await workspaces.getProject(document.uri);
		if (project) {
			const file = project.project?.getLanguageService().context.core.virtualFiles.getSource(env.uriToFileName(document.uri))?.root;
			return file ? prune(file) : undefined;

			function prune(file: VirtualFile): VirtualFile {
				return {
					fileName: file.fileName,
					kind: file.kind,
					capabilities: file.capabilities,
					embeddedFiles: file.embeddedFiles.map(prune),
					version: project!.project!.getLanguageService().context.core.typescript.languageServiceHost.getScriptVersion(file.fileName),
				} as any;
			}
		}
	});
	connection.onRequest(GetVirtualFileRequest.type, async params => {
		const project = await workspaces.getProject(params.sourceFileUri);
		if (project) {
			const [virtualFile, source] = project.project?.getLanguageService().context.core.virtualFiles.getVirtualFile(params.virtualFileName) ?? [];
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
				const sourceFiles = new Set(ls.context.host.getScriptFileNames());
				for (const virtualFile of ls.context.core.typescript.languageServiceHost.getScriptFileNames()) {
					if (virtualFile.startsWith(ls.context.host.getCurrentDirectory()) && !sourceFiles.has(virtualFile)) {
						const snapshot = ls.context.core.typescript.languageServiceHost.getScriptSnapshot(virtualFile);
						if (snapshot) {
							fs.writeFile(virtualFile, snapshot.getText(0, snapshot.getLength()), () => { });
						}
					}
				}
			}
		}
	});
}
