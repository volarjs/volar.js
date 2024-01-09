import { LanguageService, ServiceEnvironment, ServicePlugin, createFileProvider, createLanguageService } from '@volar/language-service';
import type { ServerContext, ServerOptions } from '../server';
import type { ServerProject } from '../types';

export async function createSimpleServerProject(
	context: ServerContext,
	serviceEnv: ServiceEnvironment,
	serverOptions: ServerOptions,
	servicePlugins: ServicePlugin[],
): Promise<ServerProject> {

	let languageService: LanguageService | undefined;

	const languagePlugins = await serverOptions.getLanguagePlugins(serviceEnv, {});

	return {
		serviceEnv,
		getLanguageService,
		getLanguageServiceDontCreate: () => languageService,
		dispose() {
			languageService?.dispose();
		},
	};

	function getLanguageService() {
		if (!languageService) {
			const files = createFileProvider(languagePlugins, false, uri => {
				const script = context.documents.get(uri);
				if (script) {
					files.updateSourceFile(uri, script.languageId, script.getSnapshot());
				}
				else {
					files.deleteSourceFile(uri);
				}
			});
			languageService = createLanguageService(
				{ files },
				servicePlugins,
				serviceEnv,
			);
		}
		return languageService;
	}
}
