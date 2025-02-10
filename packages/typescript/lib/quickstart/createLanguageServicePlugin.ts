import { Language, LanguagePlugin } from '@volar/language-core';
import type * as ts from 'typescript';
import { createProxyLanguageService } from '../node/proxyLanguageService';
import { decorateLanguageServiceHost } from '../node/decorateLanguageServiceHost';
import { createLanguageCommon, decoratedLanguageServiceHosts, decoratedLanguageServices, makeGetExternalFiles, projectExternalFileExtensions } from './languageServicePluginCommon';

export function createLanguageServicePlugin(
	create: (
		ts: typeof import('typescript'),
		info: ts.server.PluginCreateInfo
	) => {
		languagePlugins: LanguagePlugin<string>[],
		setup?: (language: Language<string>) => void;
	}
): ts.server.PluginModuleFactory {
	return modules => {
		const { typescript: ts } = modules;

		const pluginModule: ts.server.PluginModule = {
			create(info) {
				if (
					!decoratedLanguageServices.has(info.languageService)
					&& !decoratedLanguageServiceHosts.has(info.languageServiceHost)
				) {
					decoratedLanguageServices.add(info.languageService);
					decoratedLanguageServiceHosts.add(info.languageServiceHost);

					const { languagePlugins, setup } = create(ts, info);
					const extensions = languagePlugins
						.map(plugin => plugin.typescript?.extraFileExtensions.map(ext => '.' + ext.extension) ?? [])
						.flat();
					projectExternalFileExtensions.set(info.project, extensions);
					const language = createLanguageCommon(languagePlugins, ts, info);

					const { proxy, initialize } = createProxyLanguageService(info.languageService);
					info.languageService = proxy;
					initialize(language);
					decorateLanguageServiceHost(ts, language, info.languageServiceHost);
					setup?.(language);
				}

				return info.languageService;
			},
			getExternalFiles: makeGetExternalFiles(ts),
		};
		return pluginModule;
	};
}
