import { forEachEmbeddedFile, type FileKind, type FileProvider, type TypeScriptProjectHost } from '@volar/language-core';
import * as path from 'path-browserify';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { matchFiles } from '../typescript/utilities';

export function createLanguageServiceHost(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	sys: ts.System & {
		version?: number;
	},
	projectHost: TypeScriptProjectHost,
	fileProvider: FileProvider,
	{ fileNameToId, idToFileName, getScriptVersion }: {
		fileNameToId(fileName: string): string;
		idToFileName(id: string): string;
		getScriptVersion(fileName: string): string;
	},
) {

	let lastProjectVersion: number | string | undefined;
	let tsProjectVersion = 0;
	let tsFileNames: string[] = [];
	let tsDirectories = new Set<string>();

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
		readFile(fileName) {
			const snapshot = this.getScriptSnapshot(fileName);
			if (snapshot) {
				return snapshot.getText(0, snapshot.getLength());
			}
		},
		readDirectory,
		getDirectories,
		directoryExists,
		fileExists,
		getProjectVersion: () => {
			return tsProjectVersion + ':' + sys.version;
		},
		getTypeRootsVersion: () => {
			return sys.version ?? -1; // TODO: only update for /node_modules changes?
		},
		getScriptFileNames() {
			return tsFileNames;
		},
		getScriptVersion,
		getScriptSnapshot(fileName) {

			const uri = fileNameToId(fileName);
			const virtualFile = fileProvider.getVirtualFile(uri)[0];
			if (virtualFile) {
				return virtualFile.snapshot;
			}

			const sourceFile = fileProvider.getSourceFile(uri);
			if (sourceFile && !sourceFile.root) {
				return sourceFile.snapshot;
			}
		},
		getScriptKind(fileName) {

			if (ts) {
				if (fileProvider.getSourceFile(fileNameToId(fileName)))
					return ts.ScriptKind.Deferred;

				switch (path.extname(fileName)) {
					case '.js': return ts.ScriptKind.JS;
					case '.cjs': return ts.ScriptKind.JS;
					case '.mjs': return ts.ScriptKind.JS;
					case '.jsx': return ts.ScriptKind.JSX;
					case '.ts': return ts.ScriptKind.TS;
					case '.cts': return ts.ScriptKind.TS;
					case '.mts': return ts.ScriptKind.TS;
					case '.tsx': return ts.ScriptKind.TSX;
					case '.json': return ts.ScriptKind.JSON;
					default: return ts.ScriptKind.Unknown;
				}
			}

			return 0;
		},
	};

	let lastTsVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
	let lastOtherVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();

	return new Proxy(languageServiceHost, {
		get: (target, property: keyof ts.LanguageServiceHost) => {
			sync();
			return target[property];
		},
		set: (target, property: keyof ts.LanguageServiceHost, value) => {
			return (target as any)[property] = value;
		}
	}) as ts.LanguageServiceHost;

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
			const uri = fileNameToId(fileName);
			const sourceFile = fileProvider.getSourceFile(uri);
			if (sourceFile?.root) {
				for (const embedded of forEachEmbeddedFile(sourceFile.root)) {
					if (embedded.kind === 1 satisfies FileKind.TypeScriptHostFile) {
						newTsVirtualFileSnapshots.add(embedded.snapshot);
						tsFileNamesSet.add(idToFileName(embedded.id)); // virtual .ts
					}
					else {
						newOtherVirtualFileSnapshots.add(embedded.snapshot);
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
			tsDirectories.add(path.dirname(normalizePath(fileName)));
		}
	}

	function readDirectory(
		dirName: string,
		extensions?: readonly string[],
		excludes?: readonly string[],
		includes?: readonly string[],
		depth?: number,
	): string[] {
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
			const [_, source] = fileProvider.getVirtualFile(fileNameToId(match));
			if (source) {
				return idToFileName(source.id);
			}
			return match;
		});
		return [...new Set([
			...matches,
			...sys.readDirectory(dirName, extensions, excludes, includes, depth),
		])];
	}

	function getDirectories(dirName: string): string[] {
		return [...new Set([
			...getVirtualFileDirectories(dirName),
			...sys.getDirectories(dirName),
		])];
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

	function directoryExists(dirName: string): boolean {
		return tsDirectories.has(normalizePath(dirName)) || sys.directoryExists(dirName);
	}

	function fileExists(fileName: string) {

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
			const sourceFileUri = fileNameToId(sourceFileName);

			fileProvider.getSourceFile(sourceFileUri); // trigger sync
		}

		// virtual files
		return getScriptVersion(fileName) !== '';
	}
}

function setEquals<T>(a: Set<T>, b: Set<T>) {
	if (a.size !== b.size) return false;
	for (const item of a) {
		if (!b.has(item)) return false;
	}
	return true;
}

function normalizePath(fileName: string) {
	return fileName.replace(/\\/g, '/').toLowerCase();
}
