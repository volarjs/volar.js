import type { ServiceEnvironment } from '@volar/language-service';
import { URI } from 'vscode-uri';
import type { ServerProject, ServerProjectProvider, ServerProjectProviderFactory } from '../types';
import { isFileInDir } from '../utils/isFileInDir';
import type { WorkspaceFolderManager } from '../workspaceFolderManager';
import { createSimpleServerProject } from './simpleProject';
import type { ServerContext } from '../server';

export const createSimpleProjectProvider: ServerProjectProviderFactory = (context, serverOptions, servicePlugins): ServerProjectProvider => {

	const projects = new Map<URI, Promise<ServerProject>>();

	return {
		getProject(uri) {

			const workspaceFolder = getWorkspaceFolder(uri, context.workspaceFolders, context.runtimeEnv.uriToFileName);

			let projectPromise = projects.get(workspaceFolder);
			if (!projectPromise) {
				const serviceEnv = createServiceEnvironment(context, workspaceFolder);
				projectPromise = createSimpleServerProject(context, serviceEnv, serverOptions, servicePlugins);
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

			context.reloadDiagnostics();
		},
	};
};

export function createServiceEnvironment(context: ServerContext, workspaceFolder: URI) {
	const env: ServiceEnvironment = {
		workspaceFolder: workspaceFolder.toString(),
		fs: context.runtimeEnv.fs,
		console: context.runtimeEnv.console,
		locale: context.initializeParams.locale,
		clientCapabilities: context.initializeParams.capabilities,
		getConfiguration: context.configurationHost?.getConfiguration,
		onDidChangeConfiguration: context.configurationHost?.onDidChangeConfiguration,
		onDidChangeWatchedFiles: context.onDidChangeWatchedFiles,
		typescript: {
			fileNameToUri: context.runtimeEnv.fileNameToUri,
			uriToFileName: context.runtimeEnv.uriToFileName,
		},
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
		.filter(uri => isFileInDir(fileName, uriToFileName(uri.toString())))
		.sort((a, b) => b.toString().length - a.toString().length);

	if (!folders.length) {
		folders = workspaceFolderManager.getAll();
	}

	if (!folders.length) {
		folders = [URI.parse(uri).with({ path: '/' })];
	}

	return folders[0];
}
