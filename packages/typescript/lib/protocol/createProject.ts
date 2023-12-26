import { createFileProvider, FileMap, LanguagePlugin, Language, TypeScriptProjectHost } from '@volar/language-core';
import type * as ts from 'typescript';
import { forEachEmbeddedFile } from '@volar/language-core';
import * as path from 'path-browserify';
import { matchFiles } from '../typescript/utilities';
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

	const files = createFileProvider(languages, sys.useCaseSensitiveFileNames, fileName => {

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
			files.updateSourceFile(fileName, projectHost.getLanguageId(fileName), snapshot);
		}
		else {
			files.deleteSourceFile(fileName);
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
			return moduleLiterals.map((moduleLiteral) => {
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
			return moduleNames.map((moduleName) => {
				for (const language of languages) {
					if (language.typescript?.resolveModuleName) {
						moduleName = language.typescript.resolveModuleName!(moduleName, sourceFile?.impliedNodeFormat) ?? moduleName;
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
			synchronizeFileSystem: 'sync' in sys ? () => sys.sync!() : undefined,
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
			getDefaultLibFileName: (options) => {
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
			// need sync
			getDirectories(dirName) {
				syncProject();
				return [...new Set([
					...getVirtualFileDirectories(dirName),
					...sys.getDirectories(dirName),
				])];
			},
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
			readDirectory(dirName, extensions, excludes, includes, depth) {
				syncProject();
				let matches = matchFiles(
					dirName,
					extensions,
					excludes,
					includes,
					sys?.useCaseSensitiveFileNames ?? false,
					projectHost.getCurrentDirectory(),
					depth,
					(dirPath) => {

						const files: string[] = [];

						for (const fileName of tsFileRegistry.keys()) {
							if (fileName.toLowerCase().startsWith(dirPath.toLowerCase())) {
								const baseName = fileName.substring(dirPath.length);
								if (baseName.indexOf('/') === -1) {
									files.push(baseName);
								}
							}
						}

						return {
							files,
							directories: getVirtualFileDirectories(dirPath),
						};
					},
					sys?.realpath ? (path => sys.realpath!(path)) : (path => path),
				);
				matches = matches.map(match => {
					const [_, source] = files.getVirtualFile(match);
					if (source) {
						return source.fileName;
					}
					return match;
				});
				return [...new Set([
					...matches,
					...sys.readDirectory(dirName, extensions, excludes, includes, depth),
				])];
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
				const virtualFile = files.getVirtualFile(fileName)[0];
				if (virtualFile?.typescript) {
					return virtualFile.typescript.scriptKind;
				}
				const sourceFile = files.getSourceFile(fileName);
				if (sourceFile?.virtualFile) {
					return ts.ScriptKind.Deferred;
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
					files.getSourceFile(sourceFileName); // trigger sync
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
				const sourceFile = files.getSourceFile(fileName);
				if (sourceFile?.virtualFile) {
					for (const file of forEachEmbeddedFile(sourceFile.virtualFile[0])) {
						if (file.typescript) {
							newTsVirtualFileSnapshots.add(file.snapshot);
							tsFileNamesSet.add(file.fileName); // virtual .ts
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

			const virtualFile = files.getVirtualFile(fileName)[0];
			if (virtualFile) {
				return virtualFile.snapshot;
			}

			const sourceFile = files.getSourceFile(fileName);
			if (sourceFile && !sourceFile.virtualFile) {
				return sourceFile.snapshot;
			}
		}

		function getScriptVersion(fileName: string): string {
			syncSourceFile(fileName);

			if (!scriptVersions.has(fileName)) {
				scriptVersions.set(fileName, { lastVersion: 0, map: new WeakMap() });
			}

			const version = scriptVersions.get(fileName)!;
			const virtualFile = files.getVirtualFile(fileName)[0];
			if (virtualFile) {
				if (!version.map.has(virtualFile.snapshot)) {
					version.map.set(virtualFile.snapshot, version.lastVersion++);
				}
				return version.map.get(virtualFile.snapshot)!.toString();
			}

			const isOpenedFile = !!projectHost.getScriptSnapshot(fileName);
			if (isOpenedFile) {
				const sourceFile = files.getSourceFile(fileName);
				if (sourceFile && !sourceFile.virtualFile) {
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

		function getVirtualFileDirectories(dirName: string): string[] {

			const names = new Set<string>();

			for (const fileName of tsFileRegistry.keys()) {
				if (fileName.toLowerCase().startsWith(dirName.toLowerCase())) {
					const path = fileName.substring(dirName.length);
					if (path.indexOf('/') >= 0) {
						names.add(path.split('/')[0]);
					}
				}
			}

			return [...names];
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
