import type * as ts from 'typescript';
import { decorateLanguageService } from '../node/decorateLanguageService';
import { decorateLanguageServiceHost, searchExternalFiles } from '../node/decorateLanguageServiceHost';
import { createLanguage, FileMap, LanguagePlugin } from '@volar/language-core';
import { fileLanguageIdProviderPlugin } from '../common';

const externalFiles = new WeakMap<ts.server.Project, string[]>();
const projectExternalFileExtensions = new WeakMap<ts.server.Project, string[]>();
const decoratedLanguageServices = new WeakSet<ts.LanguageService>();
const decoratedLanguageServiceHosts = new WeakSet<ts.LanguageServiceHost>();

export function createLanguageServicePlugin(
	loadLanguagePlugins: (
		ts: typeof import('typescript'),
		info: ts.server.PluginCreateInfo
	) => LanguagePlugin[],
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

					const languagePlugins = loadLanguagePlugins(ts, info);
					const extensions = languagePlugins
						.map(plugin => plugin.typescript?.extraFileExtensions.map(ext => '.' + ext.extension) ?? [])
						.flat();
					projectExternalFileExtensions.set(info.project, extensions);
					const getScriptSnapshot = info.languageServiceHost.getScriptSnapshot.bind(info.languageServiceHost);
					const getScriptVersion = info.languageServiceHost.getScriptVersion.bind(info.languageServiceHost);
					const syncedScriptVersions = new FileMap<string>(ts.sys.useCaseSensitiveFileNames);
					const language = createLanguage(
						[
							...languagePlugins,
							fileLanguageIdProviderPlugin,
						],
						ts.sys.useCaseSensitiveFileNames,
						fileName => {
							const version = getScriptVersion(fileName);
							if (syncedScriptVersions.get(fileName) === version) {
								return;
							}
							syncedScriptVersions.set(fileName, version);

							const snapshot = getScriptSnapshot(fileName);
							if (snapshot) {
								language.scripts.set(fileName, snapshot);
							}
							else {
								language.scripts.delete(fileName);
							}
						}
					);

					decorateLanguageService(ts, language, info.languageService);
					decorateLanguageServiceHost(ts, language, info.languageServiceHost);
				}

				return info.languageService;
			},
			getExternalFiles(project, updateLevel = 0) {
				if (
					updateLevel >= (1 satisfies ts.ProgramUpdateLevel.RootNamesAndUpdate)
					|| !externalFiles.has(project)
				) {
					const oldFiles = externalFiles.get(project);
					const newFiles = searchExternalFiles(ts, project, projectExternalFileExtensions.get(project)!);
					externalFiles.set(project, newFiles);
					if (oldFiles && !arrayItemsEqual(oldFiles, newFiles)) {
						project.refreshDiagnostics();
					}
				}
				return externalFiles.get(project)!;
			},
		};
		return pluginModule;
	};
}

export function arrayItemsEqual(a: string[], b: string[]) {
	if (a.length !== b.length) {
		return false;
	}
	const set = new Set(a);
	for (const file of b) {
		if (!set.has(file)) {
			return false;
		}
	}
	return true;
}
