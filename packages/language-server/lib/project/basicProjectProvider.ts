import { ServiceEnvironment } from '@volar/language-service';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';
import { createDocumentManager } from '../documentManager';
import { ServerContext } from '../server';
import { isFileInDir } from '../utils/isFileInDir';
import { WorkspaceFolderManager } from '../workspaceFolderManager';
import { InitializationOptions, ServerProject, ServerProjectProvider, BasicServerPlugin } from '../types';
import { createBasicServerProject } from './basicProject';

export const rootTsConfigNames = ['tsconfig.json', 'jsconfig.json'];

export interface WorkspacesContext extends ServerContext {
	workspaces: {
		initOptions: InitializationOptions;
		ts: typeof import('typescript/lib/tsserverlibrary') | undefined;
		tsLocalized: ts.MapLike<string> | undefined;
		workspaceFolderManager: WorkspaceFolderManager;
		documents: ReturnType<typeof createDocumentManager>;
		reloadDiagnostics(): void;
		updateDiagnosticsAndSemanticTokens(): void;
	};
}

export function createBasicProjectProvider(context: WorkspacesContext, plugins: ReturnType<BasicServerPlugin>[]): ServerProjectProvider {

	const projects = new Map<ServiceEnvironment['workspaceFolder'], Promise<ServerProject>>();

	return {
		async getProject(uri) {

			const workspaceFolder = getWorkspaceFolder(uri, context.workspaces.workspaceFolderManager, context.server.runtimeEnv.uriToFileName);

			let project = projects.get(workspaceFolder);
			if (!project) {
				project = createBasicServerProject(context, plugins, workspaceFolder);
				projects.set(workspaceFolder, project);
			}

			return project;
		},
		async getProjects() {
			return await Promise.all([...projects.values()]);
		},
		reloadProjects() {

			for (const project of projects.values()) {
				project.then(project => project.dispose());
			}

			projects.clear();

			context.workspaces.reloadDiagnostics();
		},
	};
}

export function getWorkspaceFolder(
	uri: string,
	workspaceFolderManager: WorkspaceFolderManager,
	uriToFileName: (uri: string) => string
) {

	const fileName = uriToFileName(uri);

	let folders = workspaceFolderManager
		.getAll()
		.filter(({ uri }) => isFileInDir(fileName, uriToFileName(uri.toString())))
		.sort((a, b) => b.uri.toString().length - a.uri.toString().length);

	if (!folders.length) {
		folders = workspaceFolderManager.getAll();
	}

	if (!folders.length) {
		folders = [{
			name: '',
			uri: URI.parse(uri).with({ path: '/' }),
		}];
	}

	return folders[0];
}
