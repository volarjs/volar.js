import type { Language } from '@volar/language-core';
import type * as ts from 'typescript';
import { createResolveModuleName } from '../resolveModuleName';
import { fixupImpliedNodeFormatForFile } from './utils';

export function decorateLanguageServiceHost(
	ts: typeof import('typescript'),
	language: Language<string>,
	languageServiceHost: ts.LanguageServiceHost,
) {
	const pluginExtensions = language.plugins
		.map(plugin => plugin.typescript?.extraFileExtensions.map(ext => '.' + ext.extension) ?? [])
		.flat();
	const scripts = new Map<string, [
		version: string,
		virtualScript?: {
			snapshot: ts.IScriptSnapshot;
			scriptKind: ts.ScriptKind;
			extension: string;
		},
	]>();
	const crashFileNames = new Set<string>();
	const readDirectory = languageServiceHost.readDirectory?.bind(languageServiceHost);
	const resolveModuleNameLiterals = languageServiceHost.resolveModuleNameLiterals?.bind(languageServiceHost);
	const resolveModuleNames = languageServiceHost.resolveModuleNames?.bind(languageServiceHost);
	const getScriptSnapshot = languageServiceHost.getScriptSnapshot.bind(languageServiceHost);
	const getScriptKind = languageServiceHost.getScriptKind?.bind(languageServiceHost);

	// path completion
	if (readDirectory) {
		languageServiceHost.readDirectory = (path, extensions, exclude, include, depth) => {
			if (extensions) {
				for (const ext of pluginExtensions) {
					if (!extensions.includes(ext)) {
						extensions = [...extensions, ext];
					}
				}
			}
			return readDirectory(path, extensions, exclude, include, depth);
		};
	}

	if (pluginExtensions.length) {
		const resolveModuleName = createResolveModuleName(
			ts,
			ts.sys.getFileSize,
			languageServiceHost,
			language.plugins,
			fileName => language.scripts.get(fileName),
		);
		const moduleResolutionCache = languageServiceHost.getModuleResolutionCache?.();
		const hasPluginExtension = (moduleName: string) => pluginExtensions.some(ext => moduleName.endsWith(ext));

		if (resolveModuleNameLiterals) {
			languageServiceHost.resolveModuleNameLiterals = (
				moduleLiterals,
				containingFile,
				redirectedReference,
				options,
				containingSourceFile,
				...rest
			) => {
				const disposeFixup = fixupImpliedNodeFormatForFile(
					ts,
					pluginExtensions,
					containingSourceFile,
					moduleResolutionCache?.getPackageJsonInfoCache(),
					languageServiceHost,
					options,
				);
				try {
					// Literals without a plugin extension go to the host's resolver first, so resolvers
					// patched in by other TypeScript plugins keep working; the ones it cannot resolve
					// are retried with Volar's, which also handles `resolveHiddenExtensions`.
					const hostLiterals = moduleLiterals.filter(literal => !hasPluginExtension(literal.text));
					const hostResults = hostLiterals.length
						? resolveModuleNameLiterals(
							hostLiterals,
							containingFile,
							redirectedReference,
							options,
							containingSourceFile,
							...rest,
						)
						: [];
					const hostResultMap = new Map(hostLiterals.map((literal, i) => [literal, hostResults[i]]));
					return moduleLiterals.map(moduleLiteral => {
						const hostResult = hostResultMap.get(moduleLiteral);
						if (hostResult?.resolvedModule) {
							return hostResult;
						}
						const mode = ts.getModeForUsageLocation(containingSourceFile, moduleLiteral, options);
						const result = resolveModuleName(
							moduleLiteral.text,
							containingFile,
							options,
							// The host's failed resolution may already be in the shared cache.
							hostResult ? undefined : moduleResolutionCache,
							redirectedReference,
							mode,
						);
						return hostResult && !result.resolvedModule ? hostResult : result;
					});
				}
				finally {
					disposeFixup?.();
				}
			};
		}
		if (resolveModuleNames) {
			languageServiceHost.resolveModuleNames = (
				moduleNames,
				containingFile,
				reusedNames,
				redirectedReference,
				options,
				containingSourceFile,
			) => {
				const hostNames = moduleNames.filter(name => !hasPluginExtension(name));
				const hostResults = hostNames.length
					? resolveModuleNames(
						hostNames,
						containingFile,
						reusedNames,
						redirectedReference,
						options,
						containingSourceFile,
					)
					: [];
				const hostResultMap = new Map(hostNames.map((name, i) => [name, hostResults[i]]));
				return moduleNames.map(moduleName => {
					return hostResultMap.get(moduleName)
						?? resolveModuleName(
							moduleName,
							containingFile,
							options,
							hostResultMap.has(moduleName) ? undefined : moduleResolutionCache,
							redirectedReference,
						).resolvedModule;
				});
			};
		}
	}

	languageServiceHost.getScriptSnapshot = fileName => {
		const virtualScript = updateVirtualScript(fileName, true);
		if (virtualScript) {
			return virtualScript.snapshot;
		}
		return getScriptSnapshot(fileName);
	};

	if (getScriptKind) {
		languageServiceHost.getScriptKind = fileName => {
			const virtualScript = updateVirtualScript(fileName, false);
			if (virtualScript) {
				return virtualScript.scriptKind;
			}
			return getScriptKind(fileName);
		};
	}

	function updateVirtualScript(fileName: string, shouldRegister: boolean) {
		if (crashFileNames.has(fileName)) {
			return;
		}
		let version: string | undefined;
		try {
			version = languageServiceHost.getScriptVersion(fileName);
		}
		catch {
			// fix https://github.com/vuejs/language-tools/issues/4278
			crashFileNames.add(fileName);
		}
		if (version === undefined) {
			// somehow getScriptVersion returns undefined
			return;
		}
		let script = scripts.get(fileName);
		if (!script || script[0] !== version) {
			script = [version];

			const sourceScript = language.scripts.get(fileName, undefined, shouldRegister);
			if (sourceScript?.generated) {
				const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(
					sourceScript.generated.root,
				);
				if (serviceScript) {
					if (serviceScript.preventLeadingOffset) {
						script[1] = {
							extension: serviceScript.extension,
							scriptKind: serviceScript.scriptKind,
							snapshot: serviceScript.code.snapshot,
						};
					}
					else {
						const sourceContents = sourceScript.snapshot.getText(0, sourceScript.snapshot.getLength());
						const virtualContents = sourceContents.split('\n').map(line => ' '.repeat(line.length)).join('\n')
							+ serviceScript.code.snapshot.getText(0, serviceScript.code.snapshot.getLength());
						script[1] = {
							extension: serviceScript.extension,
							scriptKind: serviceScript.scriptKind,
							snapshot: ts.ScriptSnapshot.fromString(virtualContents),
						};
					}
				}
				if (sourceScript.generated.languagePlugin.typescript?.getExtraServiceScripts) {
					console.warn('getExtraServiceScripts() is not available in TS plugin.');
				}
			}

			scripts.set(fileName, script);
		}
		return script[1];
	}
}

export function searchExternalFiles(ts: typeof import('typescript'), project: ts.server.Project, exts: string[]) {
	if (project.projectKind !== ts.server.ProjectKind.Configured) {
		return [];
	}
	const configFile = project.getProjectName();
	const config = ts.readJsonConfigFile(configFile, project.readFile.bind(project));
	const parseHost: ts.ParseConfigHost = {
		useCaseSensitiveFileNames: project.useCaseSensitiveFileNames(),
		fileExists: project.fileExists.bind(project),
		readFile: project.readFile.bind(project),
		readDirectory: (...args) => {
			args[1] = exts;
			return project.readDirectory(...args);
		},
	};
	const parsed = ts.parseJsonSourceFileConfigFileContent(config, parseHost, project.getCurrentDirectory());
	return parsed.fileNames;
}
