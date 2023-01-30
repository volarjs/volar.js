import { LanguageServiceConfig } from '@volar/language-service';

export function loadServerConfig(dir: string, configFile: string | undefined): LanguageServiceConfig | undefined {
	let configPath: string | undefined;
	try {
		configPath = require.resolve(configFile ?? './volar.config.js', { paths: [dir] });
	} catch { }

	try {
		if (configPath) {
			const config: LanguageServiceConfig = require(configPath);
			delete require.cache[configPath];
			return config;
		}
	}
	catch (err) {
		console.log(err);
	}
}
