import type { LanguagePlugin, LanguageServiceEnvironment } from '@volar/language-service';
import { createLanguage, createLanguageService, createUriMap, type LanguageService } from '@volar/language-service';
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
					{ getLanguageId: uri => server.documents.get(uri)?.languageId },
					...languagePlugins,
				],
				createUriMap(false),
				uri => {
					const document = server.documents.get(uri);
					if (document) {
						language.scripts.set(uri, document.getSnapshot(), document.languageId);
					}
					else {
						language.scripts.delete(uri);
					}
				},
			);
			languageService = createLanguageService(
				language,
				server.languageServicePlugins,
				createLanguageServiceEnvironment(server, server.workspaceFolders.all),
				{},
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

export function createLanguageServiceEnvironment(
	server: LanguageServer,
	workspaceFolders: URI[],
): LanguageServiceEnvironment {
	return {
		workspaceFolders,
		fs: server.fileSystem,
		locale: server.initializeParams?.locale,
		clientCapabilities: server.initializeParams?.capabilities,
		getConfiguration: server.configurations.get,
		onDidChangeConfiguration: server.configurations.onDidChange,
		onDidChangeWatchedFiles: server.fileWatcher.onDidChangeWatchedFiles,
	};
}
