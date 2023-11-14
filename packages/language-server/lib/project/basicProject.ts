import { LanguageService, ServiceEnvironment, createFileProvider, createLanguageService } from '@volar/language-service';
import { loadConfig } from '../config';
import { BasicServerPlugin, ServerProject } from '../types';
import { WorkspacesContext } from './basicProjectProvider';

export async function createBasicServerProject(
	context: WorkspacesContext,
	plugins: ReturnType<BasicServerPlugin>[],
	workspaceFolder: ServiceEnvironment['workspaceFolder'],
): Promise<ServerProject> {

	let languageService: LanguageService | undefined;

	const { uriToFileName, fileNameToUri, fs } = context.server.runtimeEnv;
	const env: ServiceEnvironment = {
		workspaceFolder,
		uriToFileName,
		fileNameToUri,
		fs,
		console: context.server.runtimeEnv.console,
		locale: context.server.initializeParams.locale,
		clientCapabilities: context.server.initializeParams.capabilities,
		getConfiguration: context.server.configurationHost?.getConfiguration,
		onDidChangeConfiguration: context.server.configurationHost?.onDidChangeConfiguration,
		onDidChangeWatchedFiles: context.server.onDidChangeWatchedFiles,
	};

	let config = (
		workspaceFolder.uri.scheme === 'file' ? loadConfig(
			context.server.runtimeEnv.console,
			context.server.runtimeEnv.uriToFileName(workspaceFolder.uri.toString()),
			context.workspaces.initOptions.configFilePath,
		) : {}
	) ?? {};

	for (const plugin of plugins) {
		if (plugin.resolveConfig) {
			config = await plugin.resolveConfig(config, env);
		}
	}

	return {
		workspaceFolder,
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
				env,
				{ fileProvider },
				config,
			);
		}
		return languageService;
	}
}
