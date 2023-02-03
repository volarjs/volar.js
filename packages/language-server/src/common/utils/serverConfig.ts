import { Config } from "@volar/language-service";

export function loadConfig(dir: string, configFile: string | undefined): Config | undefined {
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
		console.log(err);
	}
}
