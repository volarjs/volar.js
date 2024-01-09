import { createFileProvider, FileMap, LanguagePlugin, Language, TypeScriptProjectHost } from '@volar/language-core';
import type * as ts from 'typescript';
import { forEachEmbeddedFile } from '@volar/language-core';
import * as path from 'path-browserify';
import type { createSys } from './createSys';

const scriptVersions = new Map<string, { lastVersion: number; map: WeakMap<ts.IScriptSnapshot, number>; }>();
const fsFileSnapshots = new Map<string, [number | undefined, ts.IScriptSnapshot | undefined]>();

export function createLanguage(
	ts: typeof import('typescript'),
	sys: ReturnType<typeof createSys> | ts.System,
	languages: LanguagePlugin<any>[],
	configFileName: string | undefined,
	projectHost: TypeScriptProjectHost,
): Language {

	const files = createFileProvider(languages, sys.useCaseSensitiveFileNames, uri => {

		const fileName = projectHost.uriToFileName(uri);

		// opened files
		let snapshot = projectHost.getScriptSnapshot(fileName);

		if (!snapshot) {
			// fs files
			const cache = fsFileSnapshots.get(fileName);
			const modifiedTime = sys.getModifiedTime?.(fileName)?.valueOf();
			if (!cache || cache[0] !== modifiedTime) {
				if (sys.fileExists(fileName)) {
					const text = sys.readFile(fileName);
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
			files.updateSourceFile(uri, projectHost.getLanguageId(uri), snapshot);
		}
		else {
			files.deleteSourceFile(uri);
		}
	});

	let languageServiceHost = createLanguageServiceHost();

	for (const language of languages) {
		if (language.typescript?.resolveLanguageServiceHost) {
			languageServiceHost = language.typescript.resolveLanguageServiceHost(languageServiceHost);
		}
	}

	if (languages.some(language => language.typescript?.resolveModuleName)) {

		// TODO: can this share between monorepo packages?
		const moduleCache = ts.createModuleResolutionCache(
			languageServiceHost.getCurrentDirectory(),
			languageServiceHost.useCaseSensitiveFileNames ? s => s : s => s.toLowerCase(),
			languageServiceHost.getCompilationSettings()
		);

		let lastSysVersion = 'version' in sys ? sys.version : undefined;

		languageServiceHost.resolveModuleNameLiterals = (
			moduleLiterals,
			containingFile,
			redirectedReference,
			options,
			sourceFile
		) => {
			if ('version' in sys && lastSysVersion !== sys.version) {
				lastSysVersion = sys.version;
				moduleCache.clear();
			}
			return moduleLiterals.map(moduleLiteral => {
				let moduleName = moduleLiteral.text;
				for (const language of languages) {
					if (language.typescript?.resolveModuleName) {
						moduleName = language.typescript.resolveModuleName(moduleName, sourceFile.impliedNodeFormat) ?? moduleName;
					}
				}
				return ts.resolveModuleName(
					moduleName,
					containingFile,
					options,
					languageServiceHost,
					moduleCache,
					redirectedReference,
					sourceFile.impliedNodeFormat
				);
			});
		};
		languageServiceHost.resolveModuleNames = (
			moduleNames,
			containingFile,
			_reusedNames,
			redirectedReference,
			options,
			sourceFile
		) => {
			if ('version' in sys && lastSysVersion !== sys.version) {
				lastSysVersion = sys.version;
				moduleCache.clear();
			}
			return moduleNames.map(moduleName => {
				for (const language of languages) {
					if (language.typescript?.resolveModuleName) {
						moduleName = language.typescript.resolveModuleName(moduleName, sourceFile?.impliedNodeFormat) ?? moduleName;
					}
				}
				return ts.resolveModuleName(
					moduleName,
					containingFile,
					options,
					languageServiceHost,
					moduleCache,
					redirectedReference,
					sourceFile?.impliedNodeFormat
				).resolvedModule;
			});
		};
	}

	return {
		files,
		typescript: {
			configFileName,
			sys,
			projectHost,
			languageServiceHost,
		},
	};

	function createLanguageServiceHost() {

		let lastProjectVersion: number | string | undefined;
		let tsProjectVersion = 0;
		let tsFileRegistry = new FileMap<boolean>(sys.useCaseSensitiveFileNames);
		let lastTsVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
		let lastOtherVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();

		const languageServiceHost: ts.LanguageServiceHost = {
			...sys,
			getCurrentDirectory: projectHost.getCurrentDirectory,
			getCompilationSettings: projectHost.getCompilationSettings,
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
				return sys.useCaseSensitiveFileNames;
			},
			getNewLine() {
				return sys.newLine;
			},
			getTypeRootsVersion: () => {
				return 'version' in sys ? sys.version : -1; // TODO: only update for /node_modules changes?
			},
			getDirectories(dirName) {
				return sys.getDirectories(dirName);
			},
			readDirectory(dirName, extensions, excludes, includes, depth) {
				return sys.readDirectory(dirName, extensions, excludes, includes, depth);
			},
			// need sync
			readFile(fileName) {
				syncSourceFile(fileName);
				const snapshot = getScriptSnapshot(fileName);
				if (snapshot) {
					return snapshot.getText(0, snapshot.getLength());
				}
			},
			fileExists(fileName) {
				syncSourceFile(fileName);
				return getScriptVersion(fileName) !== '';
			},
			getProjectVersion() {
				syncProject();
				return tsProjectVersion + ('version' in sys ? `:${sys.version}` : '');
			},
			getScriptFileNames() {
				syncProject();
				return [...tsFileRegistry.keys()];
			},
			getScriptKind(fileName) {
				syncSourceFile(fileName);
				const uri = projectHost.fileNameToUri(fileName);
				const sourceFile = files.getSourceFile(uri);
				if (sourceFile?.generated) {
					for (const virtualFile of forEachEmbeddedFile(sourceFile.generated.virtualFile)) {
						if (virtualFile.typescript) {
							return virtualFile.typescript.scriptKind;
						}
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

		return languageServiceHost;

		function syncSourceFile(tsFileName: string) {
			for (const language of languages) {
				const sourceFileName = language.typescript?.resolveSourceFileName(tsFileName);
				if (sourceFileName) {
					files.getSourceFile(projectHost.fileNameToUri(sourceFileName)); // trigger sync
				}
			}
		}

		function syncProject() {

			const newProjectVersion = projectHost.getProjectVersion?.();
			const shouldUpdate = newProjectVersion === undefined || newProjectVersion !== lastProjectVersion;
			if (!shouldUpdate) {
				return;
			}

			lastProjectVersion = newProjectVersion;

			const newTsVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
			const newOtherVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
			const tsFileNamesSet = new Set<string>();

			for (const fileName of projectHost.getScriptFileNames()) {
				const sourceFile = files.getSourceFile(projectHost.fileNameToUri(fileName));
				if (sourceFile?.generated) {
					for (const file of forEachEmbeddedFile(sourceFile.generated.virtualFile)) {
						if (file.typescript) {
							newTsVirtualFileSnapshots.add(file.snapshot);
							tsFileNamesSet.add(fileName); // virtual .ts
						}
						else {
							newOtherVirtualFileSnapshots.add(file.snapshot);
						}
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
			syncSourceFile(fileName);

			const uri = projectHost.fileNameToUri(fileName);
			const sourceFile = files.getSourceFile(uri);

			if (sourceFile?.generated) {
				for (const virtualFile of forEachEmbeddedFile(sourceFile.generated.virtualFile)) {
					if (virtualFile.typescript) {
						return virtualFile.snapshot;
					}
				}
			}
			else if (sourceFile) {
				return sourceFile.snapshot;
			}
		}

		function getScriptVersion(fileName: string): string {
			syncSourceFile(fileName);

			if (!scriptVersions.has(fileName)) {
				scriptVersions.set(fileName, { lastVersion: 0, map: new WeakMap() });
			}

			const version = scriptVersions.get(fileName)!;
			const uri = projectHost.fileNameToUri(fileName);
			const sourceFile = files.getSourceFile(uri);
			if (sourceFile?.generated) {
				for (const virtualFile of forEachEmbeddedFile(sourceFile.generated.virtualFile)) {
					if (virtualFile.typescript) {
						if (!version.map.has(virtualFile.snapshot)) {
							version.map.set(virtualFile.snapshot, version.lastVersion++);
						}
						return version.map.get(virtualFile.snapshot)!.toString();
					}
				}
			}

			const isOpenedFile = !!projectHost.getScriptSnapshot(fileName);
			if (isOpenedFile) {
				const sourceFile = files.getSourceFile(uri);
				if (sourceFile && !sourceFile.generated) {
					if (!version.map.has(sourceFile.snapshot)) {
						version.map.set(sourceFile.snapshot, version.lastVersion++);
					}
					return version.map.get(sourceFile.snapshot)!.toString();
				}
			}

			if (sys.fileExists(fileName)) {
				return sys.getModifiedTime?.(fileName)?.valueOf().toString() ?? '0';
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
