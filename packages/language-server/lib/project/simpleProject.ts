import type { LanguagePlugin, LanguageServiceEnvironment } from '@volar/language-service';
import { LanguageService, createLanguage, createLanguageService, createUriMap } from '@volar/language-service';
import type { URI } from 'vscode-uri';
import type { LanguageServer, LanguageServerProject } from '../types';

export function createSimpleProject(languagePlugins: LanguagePlugin<URI>[]): LanguageServerProject {
	let server: LanguageServer;
	let languageService: LanguageService;

	return {
		setup(_server) {
			server = _server;
			const language = createLanguage(
				[
					{ getLanguageId: uri => server.features.documents.get(uri)?.languageId },
					...languagePlugins,
				],
				createUriMap(false),
				uri => {
					const document = server.features.documents.get(uri);
					if (document) {
						language.scripts.set(uri, document.getSnapshot(), document.languageId);
					}
					else {
						language.scripts.delete(uri);
					}
				}
			);
			languageService = createLanguageService(
				language,
				server.languageServicePlugins,
				createLanguageServiceEnvironment(server, server.features.workspaceFolders.all),
				{}
			);
		},
		getLanguageService() {
			return languageService;
		},
		getExistingLanguageServices() {
			return [languageService];
		},
		reload() {
			languageService.dispose();
			this.setup(server);
		},
	};
}

export function createLanguageServiceEnvironment(server: LanguageServer, workspaceFolders: URI[]): LanguageServiceEnvironment {
	return {
		workspaceFolders,
		fs: server.features.fileSystem,
		locale: server.initializeParams?.locale,
		clientCapabilities: server.initializeParams?.capabilities,
		getConfiguration: server.features.configurations.get,
		onDidChangeConfiguration: server.features.configurations.onDidChange,
		onDidChangeWatchedFiles: server.features.fileWatcher.onDidChangeWatchedFiles,
	};
}
