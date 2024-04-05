import type { Language } from '@volar/language-core';
import type * as ts from 'typescript';
import { createResolveModuleName } from '../resolveModuleName';

export function decorateLanguageServiceHost(
	ts: typeof import('typescript'),
	language: Language,
	languageServiceHost: ts.LanguageServiceHost,
) {
	const extensions = language.plugins
		.map(plugin => plugin.typescript?.extraFileExtensions.map(ext => '.' + ext.extension) ?? [])
		.flat();
	const scripts = new Map<string, [
		version: string,
		virtualScript?: {
			snapshot: ts.IScriptSnapshot;
			kind: ts.ScriptKind;
			extension: string;
		},
	]>();
	const readDirectory = languageServiceHost.readDirectory?.bind(languageServiceHost);
	const resolveModuleNameLiterals = languageServiceHost.resolveModuleNameLiterals?.bind(languageServiceHost);
	const resolveModuleNames = languageServiceHost.resolveModuleNames?.bind(languageServiceHost);
	const getScriptSnapshot = languageServiceHost.getScriptSnapshot.bind(languageServiceHost);
	const getScriptKind = languageServiceHost.getScriptKind?.bind(languageServiceHost);

	// path completion
	if (readDirectory) {
		languageServiceHost.readDirectory = (path, extensions, exclude, include, depth) => {
			if (extensions) {
				for (const ext of extensions) {
					if (!extensions.includes(ext)) {
						extensions = [...extensions, ...ext];
					}
				}
			}
			return readDirectory(path, extensions, exclude, include, depth);
		};
	}

	if (extensions.length) {

		const resolveModuleName = createResolveModuleName(ts, languageServiceHost, language.plugins, fileName => language.scripts.get(fileName));
		const getCanonicalFileName = languageServiceHost.useCaseSensitiveFileNames?.()
			? (fileName: string) => fileName
			: (fileName: string) => fileName.toLowerCase();
		const moduleResolutionCache = ts.createModuleResolutionCache(languageServiceHost.getCurrentDirectory(), getCanonicalFileName, languageServiceHost.getCompilationSettings());

		if (resolveModuleNameLiterals) {
			languageServiceHost.resolveModuleNameLiterals = (
				moduleLiterals,
				containingFile,
				redirectedReference,
				options,
				...rest
			) => {
				if (moduleLiterals.every(name => !extensions.some(ext => name.text.endsWith(ext)))) {
					return resolveModuleNameLiterals(moduleLiterals, containingFile, redirectedReference, options, ...rest);
				}
				return moduleLiterals.map(moduleLiteral => {
					return resolveModuleName(moduleLiteral.text, containingFile, options, moduleResolutionCache, redirectedReference);
				});
			};
		}
		if (resolveModuleNames) {
			languageServiceHost.resolveModuleNames = (
				moduleNames,
				containingFile,
				reusedNames,
				redirectedReference,
				options,
				containingSourceFile
			) => {
				if (moduleNames.every(name => !extensions.some(ext => name.endsWith(ext)))) {
					return resolveModuleNames(moduleNames, containingFile, reusedNames, redirectedReference, options, containingSourceFile);
				}
				return moduleNames.map(moduleName => {
					return resolveModuleName(moduleName, containingFile, options, moduleResolutionCache, redirectedReference).resolvedModule;
				});
			};
		}
	}

	languageServiceHost.getScriptSnapshot = fileName => {
		const virtualScript = updateVirtualScript(fileName);
		if (virtualScript) {
			return virtualScript.snapshot;
		}
		return getScriptSnapshot(fileName);
	};

	if (getScriptKind) {
		languageServiceHost.getScriptKind = fileName => {
			const virtualScript = updateVirtualScript(fileName);
			if (virtualScript) {
				return virtualScript.kind;
			}
			return getScriptKind(fileName);
		};
	}

	function updateVirtualScript(fileName: string) {
		const version = languageServiceHost.getScriptVersion(fileName);
		let script = scripts.get(fileName);
		if (script?.[0] !== version) {
			script = [version];

			const sourceScript = language.scripts.get(fileName);
			if (sourceScript?.generated) {
				const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
				if (serviceScript) {
					const sourceContents = sourceScript.snapshot.getText(0, sourceScript.snapshot.getLength());
					let virtualContents = sourceContents.split('\n').map(line => ' '.repeat(line.length)).join('\n');
					virtualContents += serviceScript.code.snapshot.getText(0, serviceScript.code.snapshot.getLength());
					script[1] = {
						extension: serviceScript.extension,
						kind: serviceScript.scriptKind,
						snapshot: ts.ScriptSnapshot.fromString(virtualContents),
					};
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
