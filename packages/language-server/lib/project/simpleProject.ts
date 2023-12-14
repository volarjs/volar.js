import { LanguageService, ServiceEnvironment, createFileProvider, createLanguageService } from '@volar/language-service';
import { getConfig } from '../config';
import type { ServerProject, ServerPlugin } from '../types';
import type { WorkspacesContext } from './simpleProjectProvider';

export async function createSimpleServerProject(
	context: WorkspacesContext,
	plugins: ReturnType<ServerPlugin>[],
	serviceEnv: ServiceEnvironment,
): Promise<ServerProject> {

	let languageService: LanguageService | undefined;

	const config = await getConfig(context, plugins, serviceEnv, {});

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
			const files = createFileProvider(Object.values(config.languages), false, fileName => {
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
				Object.values(config.services),
				serviceEnv,
			);
		}
		return languageService;
	}
}
