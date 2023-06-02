import type { FileKind, VirtualFile, LanguageContext } from '@volar/language-service';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { posix as path } from 'path';

export function createLanguageServiceHost(
	ctx: LanguageContext,
	ts: typeof import('typescript/lib/tsserverlibrary'),
	sys: ts.System & {
		version?: number;
	},
) {

	let lastProjectVersion: number | string | undefined;
	let tsProjectVersion = 0;

	const _tsHost: ts.LanguageServiceHost = {
		...sys,
		getCurrentDirectory: ctx.host.getCurrentDirectory,
		getCancellationToken: ctx.host.getCancellationToken,
		getLocalizedDiagnosticMessages: ctx.host.getLocalizedDiagnosticMessages,
		getCompilationSettings: ctx.host.getCompilationSettings,
		getProjectReferences: ctx.host.getProjectReferences,
		getDefaultLibFileName: (options) => {
			try {
				return ts.getDefaultLibFilePath(options);
			} catch {
				// web
				return `/node_modules/typescript/lib/${ts.getDefaultLibFileName(options)}`;
			}
		},
		useCaseSensitiveFileNames: sys ? () => sys.useCaseSensitiveFileNames : undefined,
		getNewLine: sys ? () => sys.newLine : undefined,
		readFile: fileName => {
			const snapshot = getScriptSnapshot(fileName);
			if (snapshot) {
				return snapshot.getText(0, snapshot.getLength());
			}
		},
		fileExists,
		getProjectVersion: () => {
			return tsProjectVersion.toString() + ':' + sys.version;
		},
		getScriptFileNames,
		getScriptVersion,
		getScriptSnapshot,
		getScriptKind(fileName) {

			if (ts) {
				if (ctx.virtualFiles.hasSource(fileName))
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
	const fsFileSnapshots = new Map<string, [number | undefined, ts.IScriptSnapshot | undefined]>();
	const fileVersions = new Map<string, { value: number, versions: WeakMap<ts.IScriptSnapshot, number>; }>();

	let oldTsVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
	let oldOtherVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();

	return new Proxy(_tsHost, {
		get: (target, property: keyof ts.LanguageServiceHost) => {
			sync();
			return target[property];
		},
	}) as ts.LanguageServiceHost;

	function sync() {

		const newProjectVersion = ctx.host.getProjectVersion();
		const shouldUpdate = newProjectVersion !== lastProjectVersion;
		if (!shouldUpdate)
			return;

		lastProjectVersion = newProjectVersion;

		const newTsVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
		const newOtherVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();

		for (const { root } of ctx.virtualFiles.allSources()) {
			forEachEmbeddedFile(root, embedded => {
				if (embedded.kind === 1 satisfies FileKind.TypeScriptHostFile) {
					newTsVirtualFileSnapshots.add(embedded.snapshot);
				}
				else {
					newOtherVirtualFileSnapshots.add(embedded.snapshot);
				}
			});
		}

		if (!setEquals(oldTsVirtualFileSnapshots, newTsVirtualFileSnapshots)) {
			tsProjectVersion++;
		}
		else if (setEquals(oldOtherVirtualFileSnapshots, newOtherVirtualFileSnapshots)) {
			// no any meta language files update, it mean project version was update by source files this time
			tsProjectVersion++;
		}

		oldTsVirtualFileSnapshots = newTsVirtualFileSnapshots;
		oldOtherVirtualFileSnapshots = newOtherVirtualFileSnapshots;
	}

	function getScriptFileNames() {

		const tsFileNames = new Set<string>();

		for (const { root } of ctx.virtualFiles.allSources()) {
			forEachEmbeddedFile(root, embedded => {
				if (embedded.kind === 1 satisfies FileKind.TypeScriptHostFile) {
					tsFileNames.add(embedded.fileName); // virtual .ts
				}
			});
		}

		for (const fileName of ctx.host.getScriptFileNames()) {
			if (!ctx.virtualFiles.hasSource(fileName)) {
				tsFileNames.add(fileName); // .ts
			}
		}

		return [...tsFileNames];
	}

	function getScriptSnapshot(fileName: string) {
		// virtual files
		const [virtualFile] = ctx.virtualFiles.getVirtualFile(fileName);
		if (virtualFile) {
			return virtualFile.snapshot;
		}
		// root files / opened files
		const tsScript = ctx.host.getScriptSnapshot(fileName);
		if (tsScript) {
			return tsScript;
		}
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
		return fsFileSnapshots.get(fileName)?.[1];
	}

	function getScriptVersion(fileName: string) {
		// virtual files
		const [virtualFile] = ctx.virtualFiles.getVirtualFile(fileName);
		const snapshot = virtualFile?.snapshot ?? ctx.host.getScriptSnapshot(fileName);
		if (snapshot) {
			let version = fileVersions.get(fileName);
			if (!version) {
				version = {
					value: 0,
					versions: new WeakMap(),
				};
				fileVersions.set(fileName, version);
			}
			if (!version.versions.has(snapshot)) {
				version.versions.set(snapshot, version.value++);
			}
			return version.versions.get(snapshot)!.toString();
		}
		// root files / opened files
		const version = ctx.host.getScriptVersion(fileName);
		if (version !== undefined) {
			return version;
		}
		// fs files
		return sys.getModifiedTime?.(fileName)?.valueOf().toString() ?? '';
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

			const sourceFileName = fileName.substring(0, fileName.lastIndexOf('.'));

			if (!ctx.virtualFiles.hasSource(sourceFileName)) {
				const scriptSnapshot = getScriptSnapshot(sourceFileName);
				if (scriptSnapshot) {
					ctx.virtualFiles.updateSource(sourceFileName, scriptSnapshot, ctx.host.getLanguageId?.(sourceFileName));
				}
			}
		}

		// virtual files
		if (ctx.virtualFiles.hasVirtualFile(fileName)) {
			return true;
		}

		// root files
		if (ctx.host.getScriptSnapshot(fileName)) {
			return true;
		}

		// fs files
		return !!sys.fileExists(fileName);
	}
}

function setEquals<T>(a: Set<T>, b: Set<T>) {
	if (a.size !== b.size) return false;
	for (const item of a) {
		if (!b.has(item)) return false;
	}
	return true;
}

function forEachEmbeddedFile(file: VirtualFile, cb: (embedded: VirtualFile) => void) {
	cb(file);
	for (const embeddedFile of file.embeddedFiles) {
		forEachEmbeddedFile(embeddedFile, cb);
	}
}
