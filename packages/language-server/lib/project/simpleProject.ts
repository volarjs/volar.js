import { LanguageService, ServiceEnvironment, createFileProvider, createLanguageService } from '@volar/language-service';
import { getConfig } from '../config';
import type { ServerProject, SimpleServerPlugin } from '../types';
import type { WorkspacesContext } from './simpleProjectProvider';

export async function createSimpleServerProject(
	context: WorkspacesContext,
	plugins: ReturnType<SimpleServerPlugin>[],
	serviceEnv: ServiceEnvironment,
): Promise<ServerProject> {

	let languageService: LanguageService | undefined;

	const config = await getConfig(context, plugins, serviceEnv, undefined);

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
			const files = createFileProvider(Object.values(config.languages ?? {}), false, (uri) => {
				const script = context.workspaces.documents.get(uri);
				if (script) {
					files.updateSourceFile(uri, script.getSnapshot(), script.languageId);
				}
				else {
					files.deleteSourceFile(uri);
				}
			});
			languageService = createLanguageService(
				{ files },
				Object.values(config.services ?? {}),
				serviceEnv,
			);
		}
		return languageService;
	}
}
