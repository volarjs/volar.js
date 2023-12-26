import type * as ts from 'typescript';
import { decorateLanguageService } from '../node/decorateLanguageService';
import { decorateLanguageServiceHost, searchExternalFiles } from '../node/decorateLanguageServiceHost';
import { createFileProvider, LanguagePlugin, resolveCommonLanguageId } from '@volar/language-core';
import { arrayItemsEqual } from './createTSServerPlugin';

const externalFiles = new WeakMap<ts.server.Project, string[]>();
const decoratedLanguageServices = new WeakSet<ts.LanguageService>();
const decoratedLanguageServiceHosts = new WeakSet<ts.LanguageServiceHost>();

export function createAsyncTSServerPlugin(
	extensions: string[],
	scriptKind: ts.ScriptKind,
	loadLanguagePlugins: (
		ts: typeof import('typescript'),
		info: ts.server.PluginCreateInfo
	) => Promise<LanguagePlugin[]>,
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

					let initialized = false;

					info.languageServiceHost.getScriptSnapshot = fileName => {
						if (!initialized && extensions.some(ext => fileName.endsWith(ext))) {
							return emptySnapshot;
						}
						return getScriptSnapshot(fileName);
					};
					info.languageServiceHost.getScriptVersion = fileName => {
						if (!initialized && extensions.some(ext => fileName.endsWith(ext))) {
							return 'initializing...';
						}
						return getScriptVersion(fileName);
					};
					if (getScriptKind) {
						info.languageServiceHost.getScriptKind = fileName => {
							if (!initialized && extensions.some(ext => fileName.endsWith(ext))) {
								return scriptKind; // TODO: bypass upstream bug
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

					loadLanguagePlugins(ts, info).then(languagePlugins => {
						const files = createFileProvider(
							languagePlugins,
							ts.sys.useCaseSensitiveFileNames,
							fileName => {
								const snapshot = getScriptSnapshot(fileName);
								if (snapshot) {
									files.updateSourceFile(
										fileName,
										resolveCommonLanguageId(fileName),
										snapshot
									);
								} else {
									files.deleteSourceFile(fileName);
								}
							}
						);

						decorateLanguageService(files, info.languageService);
						decorateLanguageServiceHost(files, info.languageServiceHost, ts, extensions);

						info.project.markAsDirty();
						initialized = true;
					});
				}

				return info.languageService;
			},
			getExternalFiles(project, updateLevel = 0) {
				if (
					updateLevel >= (1 satisfies ts.ProgramUpdateLevel.RootNamesAndUpdate)
					|| !externalFiles.has(project)
				) {
					const oldFiles = externalFiles.get(project);
					const newFiles = searchExternalFiles(ts, project, extensions);
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
