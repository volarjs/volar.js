import { createLanguage, FileMap, LanguagePlugin, Language, TypeScriptProjectHost, ExtraServiceScript } from '@volar/language-core';
import type * as ts from 'typescript';
import { forEachEmbeddedCode } from '@volar/language-core';
import * as path from 'path-browserify';
import { createResolveModuleName } from '../resolveModuleName';

const scriptVersions = new Map<string, { lastVersion: number; map: WeakMap<ts.IScriptSnapshot, number>; }>();
const fsFileSnapshots = new Map<string, [number | undefined, ts.IScriptSnapshot | undefined]>();

export function createTypeScriptLanguage(
	ts: typeof import('typescript'),
	languagePlugins: LanguagePlugin[],
	projectHost: TypeScriptProjectHost,
): Language {

	const language = createLanguage(
		languagePlugins,
		projectHost.useCaseSensitiveFileNames,
		fileId => {
			const fileName = projectHost.scriptIdToFileName(fileId);

			// opened files
			let snapshot = projectHost.getScriptSnapshot(fileName);
			if (!snapshot) {
				// fs files
				const cache = fsFileSnapshots.get(fileName);
				const modifiedTime = projectHost.getModifiedTime?.(fileName)?.valueOf();
				if (!cache || cache[0] !== modifiedTime) {
					if (projectHost.fileExists(fileName)) {
						const text = projectHost.readFile(fileName);
						const snapshot = text !== undefined ? ts.ScriptSnapshot.fromString(text) : undefined;
						fsFileSnapshots.set(fileName, [modifiedTime, snapshot]);
					}
					else {
						fsFileSnapshots.set(fileName, [modifiedTime, undefined]);
					}
				}
				snapshot = fsFileSnapshots.get(fileName)?.[1];
			}

			if (snapshot) {
				language.scripts.set(fileId, projectHost.getLanguageId(fileId), snapshot);
			}
			else {
				language.scripts.delete(fileId);
			}
		},
	);

	let { languageServiceHost, getExtraScript } = createLanguageServiceHost();

	for (const language of languagePlugins) {
		if (language.typescript?.resolveLanguageServiceHost) {
			languageServiceHost = language.typescript.resolveLanguageServiceHost(languageServiceHost);
		}
	}

	if (languagePlugins.some(language => language.typescript?.extraFileExtensions.length)) {

		// TODO: can this share between monorepo packages?
		const moduleCache = ts.createModuleResolutionCache(
			languageServiceHost.getCurrentDirectory(),
			languageServiceHost.useCaseSensitiveFileNames ? s => s : s => s.toLowerCase(),
			languageServiceHost.getCompilationSettings()
		);
		const resolveModuleName = createResolveModuleName(ts, languageServiceHost, languagePlugins, fileName => language.scripts.get(projectHost.fileNameToScriptId(fileName)));

		let lastSysVersion = projectHost.getSystemVersion?.();

		languageServiceHost.resolveModuleNameLiterals = (
			moduleLiterals,
			containingFile,
			redirectedReference,
			options,
			sourceFile
		) => {
			if (projectHost.getSystemVersion && lastSysVersion !== projectHost.getSystemVersion()) {
				lastSysVersion = projectHost.getSystemVersion();
				moduleCache.clear();
			}
			return moduleLiterals.map(moduleLiteral => {
				return resolveModuleName(moduleLiteral.text, containingFile, options, moduleCache, redirectedReference, sourceFile.impliedNodeFormat);
			});
		};
		languageServiceHost.resolveModuleNames = (
			moduleNames,
			containingFile,
			_reusedNames,
			redirectedReference,
			options,
		) => {
			if (projectHost.getSystemVersion && lastSysVersion !== projectHost.getSystemVersion()) {
				lastSysVersion = projectHost.getSystemVersion();
				moduleCache.clear();
			}
			return moduleNames.map(moduleName => {
				return resolveModuleName(moduleName, containingFile, options, moduleCache, redirectedReference).resolvedModule;
			});
		};
	}

	language.typescript = {
		projectHost,
		languageServiceHost,
		getExtraServiceScript: getExtraScript,
	};

	return language;

	function createLanguageServiceHost() {

		let lastProjectVersion: number | string | undefined;
		let tsProjectVersion = 0;
		let tsFileRegistry = new FileMap<boolean>(projectHost.useCaseSensitiveFileNames);
		let extraScriptRegistry = new FileMap<ExtraServiceScript>(projectHost.useCaseSensitiveFileNames);
		let lastTsVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
		let lastOtherVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();

		const languageServiceHost: ts.LanguageServiceHost = {
			...projectHost,
			getCurrentDirectory: projectHost.getCurrentDirectory,
			getCompilationSettings() {
				const options = projectHost.getCompilationSettings();
				if (languagePlugins.some(language => language.typescript?.extraFileExtensions.length)) {
					options.allowNonTsExtensions ??= true;
					if (!options.allowNonTsExtensions) {
						console.warn('`allowNonTsExtensions` must be `true`.');
					}
				}
				return options;
			},
			getLocalizedDiagnosticMessages: projectHost.getLocalizedDiagnosticMessages,
			getProjectReferences: projectHost.getProjectReferences,
			getDefaultLibFileName: options => {
				try {
					return ts.getDefaultLibFilePath(options);
				} catch {
					// web
					return `/node_modules/typescript/lib/${ts.getDefaultLibFileName(options)}`;
				}
			},
			useCaseSensitiveFileNames() {
				return projectHost.useCaseSensitiveFileNames;
			},
			getNewLine() {
				return projectHost.newLine;
			},
			getTypeRootsVersion: () => {
				return projectHost.getSystemVersion?.() ?? -1; // TODO: only update for /node_modules changes?
			},
			getDirectories(dirName) {
				return projectHost.getDirectories(dirName);
			},
			readDirectory(dirName, extensions, excludes, includes, depth) {
				const exts = new Set(extensions);
				for (const languagePlugin of languagePlugins) {
					for (const ext of languagePlugin.typescript?.extraFileExtensions ?? []) {
						exts.add('.' + ext.extension);
					}
				}
				extensions = [...exts];
				return projectHost.readDirectory(dirName, extensions, excludes, includes, depth);
			},
			readFile(fileName) {
				const snapshot = getScriptSnapshot(fileName);
				if (snapshot) {
					return snapshot.getText(0, snapshot.getLength());
				}
			},
			fileExists(fileName) {
				return getScriptVersion(fileName) !== '';
			},
			getProjectVersion() {
				sync();
				return tsProjectVersion + (projectHost.getSystemVersion ? `:${projectHost.getSystemVersion()}` : '');
			},
			getScriptFileNames() {
				sync();
				return [...tsFileRegistry.keys()];
			},
			getScriptKind(fileName) {

				sync();

				if (extraScriptRegistry.has(fileName)) {
					return extraScriptRegistry.get(fileName)!.scriptKind;
				}

				const sourceScript = language.scripts.get(projectHost.fileNameToScriptId(fileName));
				if (sourceScript?.generated) {
					const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
					if (serviceScript) {
						return serviceScript.scriptKind;
					}
				}
				switch (path.extname(fileName)) {
					case '.js':
					case '.cjs':
					case '.mjs':
						return ts.ScriptKind.JS;
					case '.jsx':
						return ts.ScriptKind.JSX;
					case '.ts':
					case '.cts':
					case '.mts':
						return ts.ScriptKind.TS;
					case '.tsx':
						return ts.ScriptKind.TSX;
					case '.json':
						return ts.ScriptKind.JSON;
					default:
						return ts.ScriptKind.Unknown;
				}
			},
			getScriptVersion,
			getScriptSnapshot,
		};

		return {
			languageServiceHost,
			getExtraScript,
		};

		function getExtraScript(fileName: string) {
			sync();
			return extraScriptRegistry.get(fileName);
		}

		function sync() {

			const newProjectVersion = projectHost.getProjectVersion?.();
			const shouldUpdate = newProjectVersion === undefined || newProjectVersion !== lastProjectVersion;
			if (!shouldUpdate) {
				return;
			}

			lastProjectVersion = newProjectVersion;
			extraScriptRegistry.clear();

			const newTsVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
			const newOtherVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
			const tsFileNamesSet = new Set<string>();

			for (const fileName of projectHost.getScriptFileNames()) {
				const sourceScript = language.scripts.get(projectHost.fileNameToScriptId(fileName));
				if (sourceScript?.generated) {
					const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
					if (serviceScript) {
						newTsVirtualFileSnapshots.add(serviceScript.code.snapshot);
						tsFileNamesSet.add(fileName);
					}
					for (const extraServiceScript of sourceScript.generated.languagePlugin.typescript?.getExtraServiceScripts?.(fileName, sourceScript.generated.root) ?? []) {
						newTsVirtualFileSnapshots.add(extraServiceScript.code.snapshot);
						tsFileNamesSet.add(extraServiceScript.fileName);
						extraScriptRegistry.set(extraServiceScript.fileName, extraServiceScript);
					}
					for (const code of forEachEmbeddedCode(sourceScript.generated.root)) {
						newOtherVirtualFileSnapshots.add(code.snapshot);
					}
				}
				else {
					tsFileNamesSet.add(fileName);
				}
			}

			if (!setEquals(lastTsVirtualFileSnapshots, newTsVirtualFileSnapshots)) {
				tsProjectVersion++;
			}
			else if (setEquals(lastOtherVirtualFileSnapshots, newOtherVirtualFileSnapshots)) {
				// no any meta language files update, it mean project version was update by source files this time
				tsProjectVersion++;
			}

			lastTsVirtualFileSnapshots = newTsVirtualFileSnapshots;
			lastOtherVirtualFileSnapshots = newOtherVirtualFileSnapshots;
			tsFileRegistry.clear();

			for (const fileName of tsFileNamesSet) {
				tsFileRegistry.set(fileName, true);
			}
		}

		function getScriptSnapshot(fileName: string) {

			sync();

			if (extraScriptRegistry.has(fileName)) {
				return extraScriptRegistry.get(fileName)!.code.snapshot;
			}

			const sourceScript = language.scripts.get(projectHost.fileNameToScriptId(fileName));

			if (sourceScript?.generated) {
				const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
				if (serviceScript) {
					return serviceScript.code.snapshot;
				}
			}
			else if (sourceScript) {
				return sourceScript.snapshot;
			}
		}

		function getScriptVersion(fileName: string): string {

			sync();

			if (!scriptVersions.has(fileName)) {
				scriptVersions.set(fileName, { lastVersion: 0, map: new WeakMap() });
			}

			const version = scriptVersions.get(fileName)!;

			if (extraScriptRegistry.has(fileName)) {
				const snapshot = extraScriptRegistry.get(fileName)!.code.snapshot;
				if (!version.map.has(snapshot)) {
					version.map.set(snapshot, version.lastVersion++);
				}
				return version.map.get(snapshot)!.toString();
			}

			const sourceScript = language.scripts.get(projectHost.fileNameToScriptId(fileName));

			if (sourceScript?.generated) {
				const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
				if (serviceScript) {
					if (!version.map.has(serviceScript.code.snapshot)) {
						version.map.set(serviceScript.code.snapshot, version.lastVersion++);
					}
					return version.map.get(serviceScript.code.snapshot)!.toString();
				}
			}

			const isOpenedFile = !!projectHost.getScriptSnapshot(fileName);

			if (isOpenedFile) {
				const sourceScript = language.scripts.get(projectHost.fileNameToScriptId(fileName));
				if (sourceScript && !sourceScript.generated) {
					if (!version.map.has(sourceScript.snapshot)) {
						version.map.set(sourceScript.snapshot, version.lastVersion++);
					}
					return version.map.get(sourceScript.snapshot)!.toString();
				}
			}

			if (projectHost.fileExists(fileName)) {
				return projectHost.getModifiedTime?.(fileName)?.valueOf().toString() ?? '0';
			}

			return '';
		}
	}
}

function setEquals<T>(a: Set<T>, b: Set<T>) {
	if (a.size !== b.size) {
		return false;
	}
	for (const item of a) {
		if (!b.has(item)) {
			return false;
		}
	}
	return true;
}
