import { Language, LanguagePlugin } from '@volar/language-core';
import type * as ts from 'typescript';
import { createProxyLanguageService } from '../node/proxyLanguageService';
import { decorateLanguageServiceHost } from '../node/decorateLanguageServiceHost';
import { createLanguageCommon, makeGetScriptInfoWithLargeFileFailsafe, decoratedLanguageServiceHosts, decoratedLanguageServices, makeGetExternalFiles} from './languageServicePluginCommon';

export function createAsyncLanguageServicePlugin(
	extensions: string[],
	getScriptKindForExtraExtensions: ts.ScriptKind | ((fileName: string) => ts.ScriptKind),
	create: (
		ts: typeof import('typescript'),
		info: ts.server.PluginCreateInfo
	) => Promise<{
		languagePlugins: LanguagePlugin<string>[],
		setup?: (language: Language<string>) => void;
	}>
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

					const emptySnapshot = ts.ScriptSnapshot.fromString('');
					const getScriptSnapshot = info.languageServiceHost.getScriptSnapshot.bind(info.languageServiceHost);
					const getScriptVersion = info.languageServiceHost.getScriptVersion.bind(info.languageServiceHost);
					const getScriptKind = info.languageServiceHost.getScriptKind?.bind(info.languageServiceHost);
					const getProjectVersion = info.languageServiceHost.getProjectVersion?.bind(info.languageServiceHost);

					const getScriptInfo = makeGetScriptInfoWithLargeFileFailsafe(info);

					let initialized = false;

					info.languageServiceHost.getScriptSnapshot = fileName => {
						if (!initialized) {
							if (extensions.some(ext => fileName.endsWith(ext))) {
								return emptySnapshot;
							}
							if (getScriptInfo(fileName)?.isScriptOpen()) {
								return emptySnapshot;
							}
						}
						return getScriptSnapshot(fileName);
					};
					info.languageServiceHost.getScriptVersion = fileName => {
						if (!initialized) {
							if (extensions.some(ext => fileName.endsWith(ext))) {
								return 'initializing...';
							}
							if (getScriptInfo(fileName)?.isScriptOpen()) {
								return getScriptVersion(fileName) + ',initializing...';
							}
						}
						return getScriptVersion(fileName);
					};
					if (getScriptKind) {
						info.languageServiceHost.getScriptKind = fileName => {
							if (!initialized && extensions.some(ext => fileName.endsWith(ext))) {
								// bypass upstream bug https://github.com/microsoft/TypeScript/issues/57631
								// TODO: check if the bug is fixed in 5.5
								if (typeof getScriptKindForExtraExtensions === 'function') {
									return getScriptKindForExtraExtensions(fileName);
								}
								else {
									return getScriptKindForExtraExtensions;
								}
							}
							return getScriptKind(fileName);
						};
					}
					if (getProjectVersion) {
						info.languageServiceHost.getProjectVersion = () => {
							if (!initialized) {
								return getProjectVersion() + ',initializing...';
							}
							return getProjectVersion();
						};
					}

					const { proxy, initialize } = createProxyLanguageService(info.languageService);
					info.languageService = proxy;

					create(ts, info).then(({ languagePlugins, setup }) => {
						const language = createLanguageCommon(languagePlugins, ts, info);

						initialize(language);
						decorateLanguageServiceHost(ts, language, info.languageServiceHost);
						setup?.(language);

						initialized = true;
						if ('markAsDirty' in info.project && typeof info.project.markAsDirty === 'function') {
							info.project.markAsDirty();
						}
					});
				}

				return info.languageService;
			},
			getExternalFiles: makeGetExternalFiles(ts),
		};
		return pluginModule;
	};
}
