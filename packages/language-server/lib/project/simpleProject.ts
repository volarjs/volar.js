import type { LanguagePlugin, LanguageServiceEnvironment, UriMap } from '@volar/language-service';
import { LanguageService, createLanguage, createLanguageService, createUriMap } from '@volar/language-service';
import type { URI } from 'vscode-uri';
import type { LanguageServer, Project } from '../types';

export function createSimpleProject(languagePlugins: LanguagePlugin<URI>[]): Project {
	let languageService: LanguageService | undefined;

	return {
		getLanguageService(server) {
			languageService ??= create(server);
			return languageService;
		},
		allLanguageServices() {
			if (languageService) {
				return [languageService];
			}
			return [];
		},
		reload() {
			languageService?.dispose();
			languageService = undefined;
		},
	};

	function create(server: LanguageServer) {
		const language = createLanguage(
			languagePlugins,
			createUriMap(false),
			uri => {
				const documentKey = server.getSyncedDocumentKey(uri) ?? uri.toString();
				const document = server.documents.get(documentKey);
				if (document) {
					language.scripts.set(uri, document.getSnapshot(), document.languageId);
				}
				else {
					language.scripts.delete(uri);
				}
			},
		);
		return createLanguageService(
			language,
			server.languageServicePlugins,
			createServiceEnvironment(server, [...server.workspaceFolders.keys()]),
		);
	}
}

export function createServiceEnvironment(server: LanguageServer, workspaceFolders: URI[]): LanguageServiceEnvironment {
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
