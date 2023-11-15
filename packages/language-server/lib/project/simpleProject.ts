import { LanguageService, ServiceEnvironment, createFileProvider, createLanguageService } from '@volar/language-service';
import { SimpleServerPlugin, ServerProject } from '../types';
import { WorkspacesContext } from './simpleProjectProvider';
import { getConfig } from '../config';

export async function createSimpleServerProject(
	context: WorkspacesContext,
	plugins: ReturnType<SimpleServerPlugin>[],
	serviceEnv: ServiceEnvironment,
): Promise<ServerProject> {

	let languageService: LanguageService | undefined;

	const config = await getConfig(context, plugins, serviceEnv);

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
			const fileProvider = createFileProvider(Object.values(config.languages ?? {}), fileName => {
				const document = context.workspaces.documents.data.pathGet(fileName);
				if (document) {
					fileProvider.updateSource(fileName, document.getSnapshot(), document.getDocument().languageId);
				}
				else {
					fileProvider.deleteSource(fileName);
				}
			});
			languageService = createLanguageService(
				{ typescript: context.workspaces.ts },
				Object.values(config.services ?? {}),
				serviceEnv,
				{ fileProvider },
			);
		}
		return languageService;
	}
}
