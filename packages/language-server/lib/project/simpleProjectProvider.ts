import type { ServiceEnvironment } from '@volar/language-service';
import { URI } from 'vscode-uri';
import type { ServerProject, ServerProjectProvider, ServerProjectProviderFactory } from '../types';
import { createSimpleServerProject } from './simpleProject';
import type { ServerContext } from '../server';
import { fileNameToUri, uriToFileName } from '../uri';
import type { UriMap } from '../utils/uriMap';

export function createSimpleProjectProviderFactory(): ServerProjectProviderFactory {
	return (context, servicePlugins, getLanguagePlugins): ServerProjectProvider => {

		const projects = new Map<string, Promise<ServerProject>>();

		return {
			getProject(uri) {

				const workspaceFolder = getWorkspaceFolder(uri, context.workspaceFolders);

				let projectPromise = projects.get(workspaceFolder);
				if (!projectPromise) {
					const serviceEnv = createServiceEnvironment(context, workspaceFolder);
					projectPromise = createSimpleServerProject(context, serviceEnv, servicePlugins, getLanguagePlugins);
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
}

export function createServiceEnvironment(context: ServerContext, workspaceFolder: string) {
	const env: ServiceEnvironment = {
		workspaceFolder,
		fs: context.runtimeEnv.fs,
		locale: context.initializeParams.locale,
		clientCapabilities: context.initializeParams.capabilities,
		getConfiguration: context.getConfiguration,
		onDidChangeConfiguration: context.onDidChangeConfiguration,
		onDidChangeWatchedFiles: context.onDidChangeWatchedFiles,
		typescript: {
			fileNameToUri: fileNameToUri,
			uriToFileName: uriToFileName,
		},
	};
	return env;
}

export function getWorkspaceFolder(uri: string, workspaceFolders: UriMap<boolean>) {

	let parsed = URI.parse(uri);

	while (true) {
		if (workspaceFolders.uriHas(parsed.toString())) {
			return parsed.toString();
		}
		const next = URI.parse(uri).with({ path: parsed.path.substring(0, parsed.path.lastIndexOf('/')) });
		if (next.path === parsed.path) {
			break;
		}
		parsed = next;
	}

	for (const folder of workspaceFolders.uriKeys()) {
		return folder;
	}

	return URI.parse(uri).with({ path: '/' }).toString();
}
