import { createFileProvider, Language, Project } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { forEachEmbeddedFile } from '@volar/language-core';
import * as path from 'path-browserify';
import { matchFiles } from '../typescript/utilities';
import type { createSys } from './createSys';

const scriptVersions = new Map<string, { lastVersion: number; map: WeakMap<ts.IScriptSnapshot, number>; }>();
const fsFileSnapshots = new Map<string, [number | undefined, ts.IScriptSnapshot | undefined]>();

export interface ProjectHost extends Pick<
	ts.LanguageServiceHost,
	'getLocalizedDiagnosticMessages'
	| 'getCompilationSettings'
	| 'getProjectReferences'
	| 'getCurrentDirectory'
	| 'getScriptFileNames'
	| 'getProjectVersion'
	| 'getScriptSnapshot'
	| 'getCancellationToken'
> {
	getFileId(fileName: string): string;
	getFileName(fileId: string): string;
	getLanguageId(id: string): string;
}

export function createProject(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	sys: ReturnType<typeof createSys> | ts.System,
	languages: Language<any>[],
	configFileName: string | undefined,
	projectHost: ProjectHost,
): Project {

	const fileProvider = createFileProvider(languages, sys.useCaseSensitiveFileNames, (id) => {

		const fileName = projectHost.getFileName(id);

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
			fileProvider.updateSourceFile(id, snapshot, projectHost.getLanguageId(id));
		}
		else {
			fileProvider.deleteSourceFile(id);
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
		fileProvider,
		typescript: {
			configFileName,
			sys,
			languageServiceHost,
			synchronizeFileSystem: 'sync' in sys ? () => sys.sync!() : undefined,
		},
	};

	function createLanguageServiceHost() {

		let lastProjectVersion: number | string | undefined;
		let tsProjectVersion = 0;
		let tsFileNames: string[] = [];
		let tsDirectories = new Set<string>();
		let lastTsVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
		let lastOtherVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();

		const languageServiceHost: ts.LanguageServiceHost = {
			...sys,
			getCurrentDirectory: projectHost.getCurrentDirectory,
			getCompilationSettings: projectHost.getCompilationSettings,
			getCancellationToken: projectHost.getCancellationToken,
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
			getDirectories(dirName): string[] {
				sync();
				return [...new Set([
					...getVirtualFileDirectories(dirName),
					...sys.getDirectories(dirName),
				])];
			},
			directoryExists(dirName: string): boolean {
				sync();
				return tsDirectories.has(dirName) || sys.directoryExists(dirName);
			},
			readFile(fileName) {
				sync();
				const snapshot = getScriptSnapshot(fileName);
				if (snapshot) {
					return snapshot.getText(0, snapshot.getLength());
				}
			},
			fileExists(fileName) {
				sync();
				// fill external virtual files
				const ext = fileName.substring(fileName.lastIndexOf('.'));
				if (
					ext === '.js'
					|| ext === '.ts'
					|| ext === '.jsx'
					|| ext === '.tsx'
				) {

					/**
					 * If try to access a external .vue file that outside of the project,
					 * the file will not process by language service host,
					 * so virtual file will not be created.
					 * 
					 * We try to create virtual file here.
					 */

					const sourceFileName = fileName.endsWith('.d.ts')
						? fileName.substring(0, fileName.lastIndexOf('.d.ts'))
						: fileName.substring(0, fileName.lastIndexOf('.'));
					const sourceFileUri = projectHost.getFileId(sourceFileName);

					fileProvider.getSourceFile(sourceFileUri); // trigger sync
				}

				// virtual files
				return getScriptVersion(fileName) !== '';
			},
			readDirectory(
				dirName: string,
				extensions?: readonly string[],
				excludes?: readonly string[],
				includes?: readonly string[],
				depth?: number,
			): string[] {
				sync();
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

						for (const fileName of tsFileNames) {
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
					const [_, source] = fileProvider.getVirtualFile(projectHost.getFileId(match));
					if (source) {
						return projectHost.getFileName(source.id);
					}
					return match;
				});
				return [...new Set([
					...matches,
					...sys.readDirectory(dirName, extensions, excludes, includes, depth),
				])];
			},
			getProjectVersion() {
				sync();
				return tsProjectVersion + ('version' in sys ? `:${sys.version}` : '');
			},
			getScriptFileNames() {
				sync();
				return tsFileNames;
			},
			getScriptKind(fileName) {
				sync();
				const virtualFile = fileProvider.getVirtualFile(projectHost.getFileId(fileName))[0];
				if (virtualFile?.typescript) {
					return virtualFile.typescript.scriptKind;
				}
				const sourceFile = fileProvider.getSourceFile(projectHost.getFileId(fileName));
				if (sourceFile?.root) {
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

		function sync() {

			const newProjectVersion = projectHost.getProjectVersion?.();
			const shouldUpdate = newProjectVersion === undefined || newProjectVersion !== lastProjectVersion;
			if (!shouldUpdate)
				return;

			lastProjectVersion = newProjectVersion;

			const newTsVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
			const newOtherVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
			const tsFileNamesSet = new Set<string>();

			for (const fileName of projectHost.getScriptFileNames()) {
				const uri = projectHost.getFileId(fileName);
				const sourceFile = fileProvider.getSourceFile(uri);
				if (sourceFile?.root) {
					for (const file of forEachEmbeddedFile(sourceFile.root)) {
						if (file.typescript?.isProjectFile) {
							newTsVirtualFileSnapshots.add(file.snapshot);
							tsFileNamesSet.add(projectHost.getFileName(file.id)); // virtual .ts
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
			tsFileNames = [...tsFileNamesSet];

			// Update tsDirectories for `directoryExists()`
			tsDirectories.clear();
			for (const fileName of tsFileNames) {
				tsDirectories.add(path.dirname(fileName));
			}
		}

		function getScriptSnapshot(fileName: string) {
			sync();

			const uri = projectHost.getFileId(fileName);
			const virtualFile = fileProvider.getVirtualFile(uri)[0];
			if (virtualFile) {
				return virtualFile.snapshot;
			}

			const sourceFile = fileProvider.getSourceFile(uri);
			if (sourceFile && !sourceFile.root) {
				return sourceFile.snapshot;
			}
		}

		function getScriptVersion(fileName: string): string {
			sync();

			if (!scriptVersions.has(fileName)) {
				scriptVersions.set(fileName, { lastVersion: 0, map: new WeakMap() });
			}

			const version = scriptVersions.get(fileName)!;
			const virtualFile = fileProvider.getVirtualFile(projectHost.getFileId(fileName))[0];
			if (virtualFile) {
				if (!version.map.has(virtualFile.snapshot)) {
					version.map.set(virtualFile.snapshot, version.lastVersion++);
				}
				return version.map.get(virtualFile.snapshot)!.toString();
			}

			const isOpenedFile = !!projectHost.getScriptSnapshot(fileName);
			if (isOpenedFile) {
				const sourceFile = fileProvider.getSourceFile(projectHost.getFileId(fileName));
				if (sourceFile && !sourceFile.root) {
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

			for (const fileName of tsFileNames) {
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
	if (a.size !== b.size) return false;
	for (const item of a) {
		if (!b.has(item)) return false;
	}
	return true;
}
