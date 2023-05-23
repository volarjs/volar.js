import type { FileKind, VirtualFile, LanguageContext } from '@volar/language-service';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { posix as path } from 'path';

export function createLanguageServiceHost(ctx: LanguageContext, ts: typeof import('typescript/lib/tsserverlibrary')) {

	let lastProjectVersion: string | undefined;
	let tsProjectVersion = 0;

	const _tsHost: Partial<ts.LanguageServiceHost> = {
		fileExists: fileName => {

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
					const scriptSnapshot = ctx.host.getScriptSnapshot(sourceFileName);
					if (scriptSnapshot) {
						ctx.virtualFiles.updateSource(sourceFileName, scriptSnapshot, ctx.host.getScriptLanguageId?.(sourceFileName));
					}
				}
			}

			if (ctx.virtualFiles.hasVirtualFile(fileName)) {
				return true;
			}

			return !!ctx.host.fileExists?.(fileName);
		},
		getProjectVersion: () => {
			return ctx.host.getTypeRootsVersion?.() + ':' + tsProjectVersion.toString();
		},
		getTypeRootsVersion: ctx.host.getTypeRootsVersion,
		getScriptFileNames,
		getScriptVersion,
		getScriptSnapshot,
		readDirectory: (_path, extensions, exclude, include, depth) => {
			const result = ctx.host.readDirectory?.(_path, extensions, exclude, include, depth) ?? [];
			for (const { fileName } of ctx.virtualFiles.allSources()) {
				const vuePath2 = path.join(_path, path.basename(fileName));
				if (path.relative(_path.toLowerCase(), fileName.toLowerCase()).startsWith('..')) {
					continue;
				}
				if (!depth && fileName.toLowerCase() === vuePath2.toLowerCase()) {
					result.push(vuePath2);
				}
				else if (depth) {
					result.push(vuePath2); // TODO: depth num
				}
			}
			return result;
		},
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
	const scriptSnapshots = new Map<string, [string, ts.IScriptSnapshot]>();
	const virtualFileVersions = new Map<string, { value: number, virtualFileSnapshot: ts.IScriptSnapshot, sourceFileSnapshot: ts.IScriptSnapshot; }>();

	let oldTsVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
	let oldOtherVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();

	return new Proxy(_tsHost, {
		get: (target, property: keyof ts.LanguageServiceHost) => {
			sync();
			return target[property] ?? ctx.host[property];
		},
	}) as ts.LanguageServiceHost;

	function sync() {

		const newProjectVersion = ctx.host.getProjectVersion?.();
		const shouldUpdate = newProjectVersion === undefined || newProjectVersion !== lastProjectVersion;
		if (!shouldUpdate)
			return;

		lastProjectVersion = newProjectVersion;

		const newTsVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();
		const newOtherVirtualFileSnapshots = new Set<ts.IScriptSnapshot>();

		ctx.syncVirtualFiles();

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

		for (const { root: rootVirtualFile } of ctx.virtualFiles.allSources()) {
			forEachEmbeddedFile(rootVirtualFile, embedded => {
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
		const version = getScriptVersion(fileName);
		const cache = scriptSnapshots.get(fileName.toLowerCase());
		if (cache && cache[0] === version) {
			return cache[1];
		}
		const [virtualFile] = ctx.virtualFiles.getVirtualFile(fileName);
		if (virtualFile) {
			const snapshot = virtualFile.snapshot;
			scriptSnapshots.set(fileName.toLowerCase(), [version, snapshot]);
			return snapshot;
		}
		let tsScript = ctx.host.getScriptSnapshot(fileName);
		if (tsScript) {
			scriptSnapshots.set(fileName.toLowerCase(), [version, tsScript]);
			return tsScript;
		}
	}

	function getScriptVersion(fileName: string) {
		let [virtualFile, source] = ctx.virtualFiles.getVirtualFile(fileName);
		if (virtualFile && source) {
			let version = virtualFileVersions.get(virtualFile.fileName);
			if (!version) {
				version = {
					value: 0,
					virtualFileSnapshot: virtualFile.snapshot,
					sourceFileSnapshot: source.snapshot,
				};
				virtualFileVersions.set(virtualFile.fileName, version);
			}
			else if (
				version.virtualFileSnapshot !== virtualFile.snapshot
				|| (ctx.host.isTsc && version.sourceFileSnapshot !== source.snapshot) // fix https://github.com/johnsoncodehk/volar/issues/1082
			) {
				version.value++;
				version.virtualFileSnapshot = virtualFile.snapshot;
				version.sourceFileSnapshot = source.snapshot;
			}
			return version.value.toString();
		}
		return ctx.host.getScriptVersion(fileName);
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
