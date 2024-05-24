import { LanguagePlugin, LanguageService, LanguageServiceEnvironment, createLanguage, createLanguageService, createUriMap } from '@volar/language-service';
import type { URI } from 'vscode-uri';
import type { ServerBase, ServerProject } from '../types';

export async function createSimpleServerProject(
	server: ServerBase,
	serviceEnv: LanguageServiceEnvironment,
	languagePlugins: LanguagePlugin<URI>[],
): Promise<ServerProject> {
	let languageService: LanguageService | undefined;

	return {
		getLanguageService,
		getLanguageServiceDontCreate: () => languageService,
		dispose() {
			languageService?.dispose();
		},
	};

	function getLanguageService() {
		if (!languageService) {
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
			languageService = createLanguageService(
				language,
				server.languageServicePlugins,
				serviceEnv,
			);
		}
		return languageService;
	}
}
