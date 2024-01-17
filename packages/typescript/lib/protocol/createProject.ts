import { createFileRegistry, FileMap, LanguagePlugin, LanguageContext, TypeScriptProjectHost } from '@volar/language-core';
import type * as ts from 'typescript';
import { forEachEmbeddedCode } from '@volar/language-core';
import * as path from 'path-browserify';
import type { createSys } from './createSys';

const scriptVersions = new Map<string, { lastVersion: number; map: WeakMap<ts.IScriptSnapshot, number>; }>();
const fsFileSnapshots = new Map<string, [number | undefined, ts.IScriptSnapshot | undefined]>();

export function createLanguage(
	ts: typeof import('typescript'),
	sys: ReturnType<typeof createSys> | ts.System,
	languagePlugins: LanguagePlugin<any>[],
	configFileName: string | undefined,
	projectHost: TypeScriptProjectHost,
	{ fileIdToFileName, fileNameToFileId }: {
		fileIdToFileName: (uri: string) => string,
		fileNameToFileId: (fileName: string) => string,
	},
): LanguageContext {

	const files = createFileRegistry(languagePlugins, sys.useCaseSensitiveFileNames, fileId => {

		const fileName = fileIdToFileName(fileId);

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
			files.set(fileId, projectHost.getLanguageId(fileId), snapshot);
		}
		else {
			files.delete(fileId);
		}
	});

	let languageServiceHost = createLanguageServiceHost();

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
				let extraFileExtension: string | undefined;
				let isPatchResult = false;
				for (const language of languagePlugins) {
					extraFileExtension = language.typescript?.extraFileExtensions.find(ext => moduleName.endsWith('.' + ext.extension))?.extension;
					if (extraFileExtension) {
						break;
					}
				}
				const result = ts.resolveModuleName(
					moduleName,
					containingFile,
					options,
					{
						...languageServiceHost,
						fileExists(fileName) {
							if (extraFileExtension && fileName.endsWith('.d.ts')) {
								const patchResult = languageServiceHost.fileExists(fileName.slice(0, -5));
								if (patchResult) {
									isPatchResult = true;
									return true;
								}
							}
							return sys.fileExists(fileName);
						},
					},
					moduleCache,
					redirectedReference,
					sourceFile.impliedNodeFormat
				);
				if (isPatchResult && result.resolvedModule) {
					result.resolvedModule.resolvedFileName = result.resolvedModule.resolvedFileName.slice(0, -5);
					const sourceFile = files.get(fileNameToFileId(result.resolvedModule.resolvedFileName));
					if (sourceFile?.generated) {
						const tsCode = sourceFile.generated.languagePlugin.typescript?.getLanguageServiceCode(sourceFile.generated.code);
						if (tsCode) {
							result.resolvedModule.extension = tsCode.extension;
						}
					}
				}
				return result;
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
			getCompilationSettings() {
				const options = projectHost.getCompilationSettings();
				if (
					languagePlugins.some(language => language.typescript?.extraFileExtensions.length)
					&& !options.allowNonTsExtensions
				) {
					console.warn('`allowNonTsExtensions` must be `true`.');
					options.allowNonTsExtensions ??= true;
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
				const exts = new Set(extensions);
				for (const languagePlugin of languagePlugins) {
					for (const ext of languagePlugin.typescript?.extraFileExtensions ?? []) {
						exts.add('.' + ext.extension);
					}
				}
				extensions = [...exts];
				return sys.readDirectory(dirName, extensions, excludes, includes, depth);
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
				syncProject();
				return tsProjectVersion + ('version' in sys ? `:${sys.version}` : '');
			},
			getScriptFileNames() {
				syncProject();
				return [...tsFileRegistry.keys()];
			},
			getScriptKind(fileName) {
				const sourceFile = files.get(fileNameToFileId(fileName));
				if (sourceFile?.generated) {
					const tsCode = sourceFile.generated.languagePlugin.typescript?.getLanguageServiceCode(sourceFile.generated.code);
					if (tsCode) {
						return tsCode.scriptKind;
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
				const sourceFile = files.get(fileNameToFileId(fileName));
				if (sourceFile?.generated) {
					const tsCode = sourceFile.generated.languagePlugin.typescript?.getLanguageServiceCode(sourceFile.generated.code);
					if (tsCode) {
						newTsVirtualFileSnapshots.add(tsCode.code.snapshot);
						tsFileNamesSet.add(fileName); // virtual .ts
					}
					for (const file of forEachEmbeddedCode(sourceFile.generated.code)) {
						newOtherVirtualFileSnapshots.add(file.snapshot);
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

			const sourceFile = files.get(fileNameToFileId(fileName));

			if (sourceFile?.generated) {
				const tsCode = sourceFile.generated.languagePlugin.typescript?.getLanguageServiceCode(sourceFile.generated.code);
				if (tsCode) {
					return tsCode.code.snapshot;
				}
			}
			else if (sourceFile) {
				return sourceFile.snapshot;
			}
		}

		function getScriptVersion(fileName: string): string {

			if (!scriptVersions.has(fileName)) {
				scriptVersions.set(fileName, { lastVersion: 0, map: new WeakMap() });
			}

			const version = scriptVersions.get(fileName)!;
			const sourceFile = files.get(fileNameToFileId(fileName));
			if (sourceFile?.generated) {
				const tsCode = sourceFile.generated.languagePlugin.typescript?.getLanguageServiceCode(sourceFile.generated.code);
				if (tsCode) {
					if (!version.map.has(tsCode.code.snapshot)) {
						version.map.set(tsCode.code.snapshot, version.lastVersion++);
					}
					return version.map.get(tsCode.code.snapshot)!.toString();
				}
			}

			const isOpenedFile = !!projectHost.getScriptSnapshot(fileName);
			if (isOpenedFile) {
				const sourceFile = files.get(fileNameToFileId(fileName));
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
