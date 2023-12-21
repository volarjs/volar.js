import { LanguageService, ServiceEnvironment, ServicePlugin, createFileProvider, createLanguageService } from '@volar/language-service';
import type { ServerOptions } from '../server';
import type { ServerProject } from '../types';
import type { WorkspacesContext } from './simpleProjectProvider';

export async function createSimpleServerProject(
	context: WorkspacesContext,
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
			const files = createFileProvider(languagePlugins, false, fileName => {
				const uri = context.server.runtimeEnv.fileNameToUri(fileName);
				const script = context.workspaces.documents.get(uri);
				if (script) {
					files.updateSourceFile(fileName, script.languageId, script.getSnapshot());
				}
				else {
					files.deleteSourceFile(fileName);
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
