import type { LanguagePlugin, ServiceEnvironment } from '@volar/language-service';
import { URI } from 'vscode-uri';
import type { ServerBase, ServerProject, ServerProjectProvider } from '../types';
import type { UriMap } from '../utils/uriMap';
import { createSimpleServerProject } from './simpleProject';

export function createSimpleProjectProvider(languagePlugins: LanguagePlugin[]): ServerProjectProvider {
	const map = new Map<string, Promise<ServerProject>>();
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

export function createServiceEnvironment(server: ServerBase, workspaceFolder: string): ServiceEnvironment {
	return {
		workspaceFolder,
		fs: server.fs,
		locale: server.initializeParams?.locale,
		clientCapabilities: server.initializeParams?.capabilities,
		getConfiguration: server.getConfiguration,
		onDidChangeConfiguration: server.onDidChangeConfiguration,
		onDidChangeWatchedFiles: server.onDidChangeWatchedFiles,
		typescript: {
			fileNameToUri: server.uriConverter.fileNameToUri,
			uriToFileName: server.uriConverter.uriToFileName,
		},
	};
}

export function getWorkspaceFolder(uri: string, workspaceFolders: UriMap<boolean>) {

	let parsed = URI.parse(uri);

	while (true) {
		if (workspaceFolders.has(parsed.toString())) {
			return parsed.toString();
		}
		const next = URI.parse(uri).with({ path: parsed.path.substring(0, parsed.path.lastIndexOf('/')) });
		if (next.path === parsed.path) {
			break;
		}
		parsed = next;
	}

	for (const folder of workspaceFolders.keys()) {
		return folder;
	}

	return URI.parse(uri).with({ path: '/' }).toString();
}
