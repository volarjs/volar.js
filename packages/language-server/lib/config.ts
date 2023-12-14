import type { Console, ServiceEnvironment } from '@volar/language-service';
import type { WorkspacesContext } from './project/simpleProjectProvider';
import type { Config, ProjectContext, ServerPlugin } from '../lib/types';

export async function getConfig(
	context: WorkspacesContext,
	plugins: ReturnType<ServerPlugin>[],
	env: ServiceEnvironment,
	projectCtx: ProjectContext,
) {

	let config: Config = (
		env.workspaceFolder.uri.scheme === 'file' && loadConfig(
			context.server.runtimeEnv.console,
			context.server.runtimeEnv.uriToFileName(env.workspaceFolder.uri.toString()),
			context.workspaces.initOptions.configFilePath,
		) || { languages: Object.create(null), services: Object.create(null) }
	);

	for (const plugin of plugins) {
		if (plugin.resolveConfig) {
			config = await plugin.resolveConfig(config, env, projectCtx);
		}
	}

	return config;
}

export function loadConfig(console: Console, dir: string, configFile: string | undefined): Config | undefined {
	let configPath: string | undefined;
	try {
		configPath = require.resolve(configFile ?? './volar.config.js', { paths: [dir] });
	} catch { }

	try {
		if (configPath) {
			const config: Config = require(configPath);
			delete require.cache[configPath];
			return config;
		}
	}
	catch (err) {
		console.warn(String(err));
	}
}
