import type { ServiceEnvironment } from '@volar/language-service';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';
import type { ServerContext } from '../server';
import { isFileInDir } from '../utils/isFileInDir';
import type { WorkspaceFolderManager } from '../workspaceFolderManager';
import type { InitializationOptions, ServerProject, ServerProjectProvider, SimpleServerPlugin } from '../types';
import { createSimpleServerProject } from './simpleProject';
import type { TextDocuments } from 'vscode-languageserver';
import type { SnapshotDocument } from '@volar/snapshot-document';

export interface WorkspacesContext extends ServerContext {
	workspaces: {
		initOptions: InitializationOptions;
		ts: typeof import('typescript/lib/tsserverlibrary') | undefined;
		tsLocalized: ts.MapLike<string> | undefined;
		workspaceFolders: WorkspaceFolderManager;
		documents: TextDocuments<SnapshotDocument>;
		reloadDiagnostics(): void;
		updateDiagnosticsAndSemanticTokens(): void;
	};
}

export function createSimpleProjectProvider(context: WorkspacesContext, plugins: ReturnType<SimpleServerPlugin>[]): ServerProjectProvider {

	const projects = new Map<ServiceEnvironment['workspaceFolder'], Promise<ServerProject>>();

	return {
		getProject(uri) {

			const workspaceFolder = getWorkspaceFolder(uri, context.workspaces.workspaceFolders, context.server.runtimeEnv.uriToFileName);

			let projectPromise = projects.get(workspaceFolder);
			if (!projectPromise) {
				const serviceEnv = createServiceEnvironment(context, workspaceFolder);
				projectPromise = createSimpleServerProject(context, plugins, serviceEnv);
				projects.set(workspaceFolder, projectPromise);
			}

			return projectPromise;
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

export function createServiceEnvironment(context: WorkspacesContext, workspaceFolder: ServiceEnvironment['workspaceFolder']) {
	const env: ServiceEnvironment = {
		workspaceFolder,
		uriToFileName: context.server.runtimeEnv.uriToFileName,
		fileNameToUri: context.server.runtimeEnv.fileNameToUri,
		fs: context.server.runtimeEnv.fs,
		console: context.server.runtimeEnv.console,
		locale: context.server.initializeParams.locale,
		clientCapabilities: context.server.initializeParams.capabilities,
		getConfiguration: context.server.configurationHost?.getConfiguration,
		onDidChangeConfiguration: context.server.configurationHost?.onDidChangeConfiguration,
		onDidChangeWatchedFiles: context.server.onDidChangeWatchedFiles,
	};
	return env;
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
