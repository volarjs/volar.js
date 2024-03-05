import type { FileRegistry } from '@volar/language-core';
import type * as ts from 'typescript';
import { createResolveModuleName } from '../resolveModuleName';

export function decorateLanguageServiceHost(
	files: FileRegistry,
	languageServiceHost: ts.LanguageServiceHost,
	ts: typeof import('typescript'),
) {

	let extraProjectVersion = 0;

	const { languagePlugins } = files;
	const exts = languagePlugins
		.map(plugin => plugin.typescript?.extraFileExtensions.map(ext => '.' + ext.extension) ?? [])
		.flat();
	const scripts = new Map<string, {
		projectVersion: string | undefined;
		version: number;
		snapshot: ts.IScriptSnapshot | undefined;
		kind: ts.ScriptKind;
		extension: string;
	}>();

	const readDirectory = languageServiceHost.readDirectory?.bind(languageServiceHost);
	const resolveModuleNameLiterals = languageServiceHost.resolveModuleNameLiterals?.bind(languageServiceHost);
	const resolveModuleNames = languageServiceHost.resolveModuleNames?.bind(languageServiceHost);
	const getProjectVersion = languageServiceHost.getProjectVersion?.bind(languageServiceHost);
	const getScriptSnapshot = languageServiceHost.getScriptSnapshot.bind(languageServiceHost);
	const getScriptVersion = languageServiceHost.getScriptVersion.bind(languageServiceHost);
	const getScriptKind = languageServiceHost.getScriptKind?.bind(languageServiceHost);

	// path completion
	if (readDirectory) {
		languageServiceHost.readDirectory = (path, extensions, exclude, include, depth) => {
			if (extensions) {
				for (const ext of exts) {
					if (!extensions.includes(ext)) {
						extensions = [...extensions, ...ext];
					}
				}
			}
			return readDirectory(path, extensions, exclude, include, depth);
		};
	}

	if (languagePlugins.some(language => language.typescript?.extraFileExtensions.length)) {

		const resolveModuleName = createResolveModuleName(ts, languageServiceHost, languagePlugins, fileName => files.get(fileName));

		if (resolveModuleNameLiterals) {
			languageServiceHost.resolveModuleNameLiterals = (
				moduleLiterals,
				containingFile,
				redirectedReference,
				options,
				...rest
			) => {
				if (moduleLiterals.every(name => !exts.some(ext => name.text.endsWith(ext)))) {
					return resolveModuleNameLiterals(moduleLiterals, containingFile, redirectedReference, options, ...rest);
				}
				return moduleLiterals.map(moduleLiteral => {
					return resolveModuleName(moduleLiteral.text, containingFile, options, undefined, redirectedReference);
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
				if (moduleNames.every(name => !exts.some(ext => name.endsWith(ext)))) {
					return resolveModuleNames(moduleNames, containingFile, reusedNames, redirectedReference, options, containingSourceFile);
				}
				return moduleNames.map(moduleName => {
					return resolveModuleName(moduleName, containingFile, options, undefined, redirectedReference).resolvedModule;
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
		if (exts.some(ext => fileName.endsWith(ext))) {
			updateScript(fileName);
			return scripts.get(fileName)?.snapshot;
		}
		return getScriptSnapshot(fileName);
	};
	languageServiceHost.getScriptVersion = fileName => {
		if (exts.some(ext => fileName.endsWith(ext))) {
			updateScript(fileName);
			return scripts.get(fileName)?.version.toString() ?? '';
		}
		return getScriptVersion(fileName);
	};

	if (getScriptKind) {
		languageServiceHost.getScriptKind = fileName => {
			if (exts.some(ext => fileName.endsWith(ext))) {
				updateScript(fileName);
				const script = scripts.get(fileName);
				if (script) {
					return script.kind;
				}
				return ts.ScriptKind.Deferred;
			}
			return getScriptKind(fileName);
		};
	}

	function updateScript(fileName: string) {

		const version = getProjectVersion?.();
		const cache = scripts.get(fileName);

		if (version === undefined || version !== cache?.projectVersion) {

			const file = files.get(fileName);
			const script = file?.generated?.languagePlugin.typescript?.getScript(file.generated.code);

			if (script?.code.snapshot !== cache?.snapshot) {

				let extension = '.ts';
				let snapshotSnapshot: ts.IScriptSnapshot | undefined;
				let scriptKind = ts.ScriptKind.TS;

				extraProjectVersion++;

				if (script) {
					if (file?.generated) {
						const text = file.snapshot.getText(0, file.snapshot.getLength());
						let patchedText = text.split('\n').map(line => ' '.repeat(line.length)).join('\n');
						extension = script.extension;
						scriptKind = script.scriptKind;
						patchedText += script.code.snapshot.getText(0, script.code.snapshot.getLength());
						snapshotSnapshot = ts.ScriptSnapshot.fromString(patchedText);
						if (file.generated.languagePlugin.typescript?.getExtraScripts) {
							console.warn('getExtraScripts() is not available in this use case.');
						}
					}
				}
				else if (files.get(fileName)) {
					files.delete(fileName);
				}

				if (!cache) {
					scripts.set(fileName, {
						projectVersion: version,
						version: 0,
						extension,
						snapshot: snapshotSnapshot,
						kind: scriptKind,
					});
				}
				else {
					cache.projectVersion = version;
					cache.version++;
					cache.extension = extension;
					cache.snapshot = snapshotSnapshot;
					cache.kind = scriptKind;
				}
			}
			else if (cache) {
				cache.projectVersion = version;
			}
		}

		return scripts.get(fileName);
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
