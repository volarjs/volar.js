import { UriMap, createUriMap, type LanguagePlugin, type LanguageServiceEnvironment } from '@volar/language-service';
import type { URI } from 'vscode-uri';
import type { ServerBase, ServerProject, ServerProjectProvider } from '../types';
import { createSimpleServerProject } from './simpleProject';

export function createSimpleProjectProvider(languagePlugins: LanguagePlugin<URI>[]): ServerProjectProvider {
	const map = createUriMap<Promise<ServerProject>>();
	return {
		get(uri) {
			const workspaceFolder = getWorkspaceFolder(uri, this.workspaceFolders);
			let projectPromise = map.get(workspaceFolder);
			if (!projectPromise) {
				const serviceEnv = createServiceEnvironment(this, workspaceFolder);
				projectPromise = createSimpleServerProject(this, serviceEnv, languagePlugins);
				map.set(workspaceFolder, projectPromise);
			}
			return projectPromise;
		},
		async all() {
			return await Promise.all([...map.values()]);
		},
		reload() {
			for (const project of map.values()) {
				project.then(p => p.dispose());
			}
			map.clear();
		},
	};
}

export function createServiceEnvironment(server: ServerBase, workspaceFolder: URI): LanguageServiceEnvironment {
	return {
		workspaceFolder: workspaceFolder,
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
