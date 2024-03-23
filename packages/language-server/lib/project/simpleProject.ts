import { LanguageService, ServiceEnvironment, ServicePlugin, createLanguage, createLanguageService } from '@volar/language-service';
import type { ServerContext, ServerOptions } from '../server';
import type { ServerProject } from '../types';

export async function createSimpleServerProject(
	context: ServerContext,
	serviceEnv: ServiceEnvironment,
	servicePlugins: ServicePlugin[],
	getLanguagePlugins: ServerOptions['getLanguagePlugins'],
): Promise<ServerProject> {

	let languageService: LanguageService | undefined;

	const languagePlugins = await getLanguagePlugins(serviceEnv, {});

	return {
		getLanguageService,
		getLanguageServiceDontCreate: () => languageService,
		dispose() {
			languageService?.dispose();
		},
	};

	function getLanguageService() {
		if (!languageService) {
			const language = createLanguage(languagePlugins, false, uri => {
				const script = context.documents.get(uri);
				if (script) {
					language.scripts.set(uri, script.languageId, script.getSnapshot());
				}
				else {
					language.scripts.delete(uri);
				}
			});
			languageService = createLanguageService(
				language,
				servicePlugins,
				serviceEnv,
			);
		}
		return languageService;
	}
}
