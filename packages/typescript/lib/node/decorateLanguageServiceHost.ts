import type { Language } from '@volar/language-core';
import type * as ts from 'typescript';
import { createResolveModuleName } from '../resolveModuleName';

export function decorateLanguageServiceHost(
	ts: typeof import('typescript'),
	language: Language,
	languageServiceHost: ts.LanguageServiceHost,
	getLanguageId: (fileName: string) => string,
) {

	let extraProjectVersion = 0;

	const extensions = language.plugins
		.map(plugin => plugin.typescript?.extraFileExtensions.map(ext => '.' + ext.extension) ?? [])
		.flat();
	const scripts = new Map<string, [version: string, {
		snapshot: ts.IScriptSnapshot;
		kind: ts.ScriptKind;
		extension: string;
	}]>();

	const readDirectory = languageServiceHost.readDirectory?.bind(languageServiceHost);
	const resolveModuleNameLiterals = languageServiceHost.resolveModuleNameLiterals?.bind(languageServiceHost);
	const resolveModuleNames = languageServiceHost.resolveModuleNames?.bind(languageServiceHost);
	const getProjectVersion = languageServiceHost.getProjectVersion?.bind(languageServiceHost);
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

	if (getProjectVersion) {
		languageServiceHost.getProjectVersion = () => {
			return getProjectVersion() + ':' + extraProjectVersion;
		};
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

		if (version !== scripts.get(fileName)?.[0]) {

			let extension = '.ts';
			let snapshotSnapshot: ts.IScriptSnapshot | undefined;
			let scriptKind = ts.ScriptKind.TS;

			const snapshot = getScriptSnapshot(fileName);

			if (snapshot) {
				extraProjectVersion++;
				const sourceScript = language.scripts.set(fileName, getLanguageId(fileName), snapshot);
				if (sourceScript.generated) {
					const text = snapshot.getText(0, snapshot.getLength());
					let patchedText = text.split('\n').map(line => ' '.repeat(line.length)).join('\n');
					const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
					if (serviceScript) {
						extension = serviceScript.extension;
						scriptKind = serviceScript.scriptKind;
						patchedText += serviceScript.code.snapshot.getText(0, serviceScript.code.snapshot.getLength());
					}
					snapshotSnapshot = ts.ScriptSnapshot.fromString(patchedText);
					if (sourceScript.generated.languagePlugin.typescript?.getExtraServiceScripts) {
						console.warn('getExtraScripts() is not available in this use case.');
					}
				}
			}
			else if (language.scripts.get(fileName)) {
				extraProjectVersion++;
				language.scripts.delete(fileName);
			}

			if (snapshotSnapshot) {
				scripts.set(fileName, [
					version,
					{
						extension,
						snapshot: snapshotSnapshot,
						kind: scriptKind,
					}
				]);
			}
		}

		return scripts.get(fileName)?.[1];
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
