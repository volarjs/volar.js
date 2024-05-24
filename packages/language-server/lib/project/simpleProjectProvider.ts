import type { UriMap, LanguagePlugin, LanguageServiceEnvironment } from '@volar/language-service';
import type { URI } from 'vscode-uri';
import type { ServerBase, ServerProject, ServerProjectProvider } from '../types';
import { createSimpleServerProject } from './simpleProject';

export function createSimpleProjectProvider(languagePlugins: LanguagePlugin<URI>[]): ServerProjectProvider {
	let project: Promise<ServerProject> | undefined;
	return {
		get() {
			project ??= createSimpleServerProject(this, createServiceEnvironment(this, [...this.workspaceFolders.keys()]), languagePlugins);
			return project;
		},
		async all() {
			if (project) {
				return [await project];
			}
			return [];
		},
		reload() {
			project?.then(project => project.dispose());
			project = undefined;
		},
	};
}

export function createServiceEnvironment(server: ServerBase, workspaceFolders: URI[]): LanguageServiceEnvironment {
	return {
		workspaceFolders,
		fs: server.fs,
		locale: server.initializeParams?.locale,
		clientCapabilities: server.initializeParams?.capabilities,
		getConfiguration: server.getConfiguration,
		onDidChangeConfiguration: server.onDidChangeConfiguration,
		onDidChangeWatchedFiles: server.onDidChangeWatchedFiles,
	};
}

export function getWorkspaceFolder(uri: URI, workspaceFolders: UriMap<boolean>) {
	while (true) {
		if (workspaceFolders.has(uri)) {
			return uri;
		}
		const next = uri.with({ path: uri.path.substring(0, uri.path.lastIndexOf('/')) });
		if (next.path === uri.path) {
			break;
		}
		uri = next;
	}

	for (const folder of workspaceFolders.keys()) {
		return folder;
	}

	return uri.with({ path: '/' });
}
