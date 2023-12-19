import { LanguageService, ServiceEnvironment, createFileProvider, createLanguageService } from '@volar/language-service';
import type { ServerOptions } from '../server';
import type { ServerProject } from '../types';
import type { WorkspacesContext } from './simpleProjectProvider';

export async function createSimpleServerProject(
	context: WorkspacesContext,
	serviceEnv: ServiceEnvironment,
	serverOptions: ServerOptions,
): Promise<ServerProject> {

	let languageService: LanguageService | undefined;

	const { languagePlugins, servicePlugins } = await serverOptions.getProjectSetup(serviceEnv, {});

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
