import { SourceMap } from '@volar/source-map';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { MirrorMap } from './sourceMaps';
import type { FileRangeCapabilities, Language, VirtualFile } from './types';

export type VirtualFiles = ReturnType<typeof createVirtualFiles>;

export interface Source {
	fileName: string;
	languageId: string | undefined;
	snapshot: ts.IScriptSnapshot;
	root: VirtualFile;
	language: Language;
}

export function createVirtualFiles(languages: Language[]) {

	const sourceFiles = new Map<string, Source>();
	const virtualFiles = new Map<string, { virtualFile: VirtualFile, source: Source; }>();
	const virtualFileMaps = new WeakMap<ts.IScriptSnapshot, Map<string, [ts.IScriptSnapshot, SourceMap<FileRangeCapabilities>]>>();
	const virtualFileToMirrorMap = new WeakMap<ts.IScriptSnapshot, MirrorMap | undefined>();

	let sourceFilesDirty = true;

	return {
		allSources() {
			return Array.from(sourceFiles.values());
		},
		updateSource(fileName: string, snapshot: ts.IScriptSnapshot, languageId: string | undefined): VirtualFile | undefined {
			const key = normalizePath(fileName);
			const value = sourceFiles.get(key);
			if (value) {
				if (value.languageId !== languageId) {
					// languageId changed
					this.deleteSource(fileName);
					return this.updateSource(fileName, snapshot, languageId);
				}
				else {
					value.snapshot = snapshot;
					value.language.updateVirtualFile(value.root, snapshot);
					sourceFilesDirty = true;
					return value.root; // updated
				}
			}
			for (const language of languages) {
				const virtualFile = language.createVirtualFile(fileName, snapshot, languageId);
				if (virtualFile) {
					sourceFiles.set(key, { fileName, languageId, snapshot, root: virtualFile, language });
					sourceFilesDirty = true;
					return virtualFile; // created
				}
			}
		},
		deleteSource(fileName: string) {
			const key = normalizePath(fileName);
			const value = sourceFiles.get(key);
			if (value) {
				value.language.deleteVirtualFile?.(value.root);
				sourceFiles.delete(key); // deleted
				sourceFilesDirty = true;
			}
		},
		getSource(fileName: string) {
			const key = normalizePath(fileName);
			return sourceFiles.get(key);
		},
		hasSource: (fileName: string) => sourceFiles.has(normalizePath(fileName)),
		getMirrorMap: getMirrorMap,
		getMaps: getMapsByVirtualFile,
		hasVirtualFile(fileName: string) {
			return !!getVirtualFileToSourceFileMap().get(normalizePath(fileName));
		},
		getVirtualFile(fileName: string) {
			const sourceAndVirtual = getVirtualFileToSourceFileMap().get(normalizePath(fileName));
			if (sourceAndVirtual) {
				return [sourceAndVirtual.virtualFile, sourceAndVirtual.source] as const;
			}
			return [undefined, undefined] as const;
		},
	};

	function getVirtualFileToSourceFileMap() {
		if (sourceFilesDirty) {
			sourceFilesDirty = false;
			virtualFiles.clear();
			for (const [_, row] of sourceFiles) {
				forEachEmbeddedFile(row.root, file => {
					virtualFiles.set(normalizePath(file.fileName), { virtualFile: file, source: row });
				});
			}
		}
		return virtualFiles;
	}

	function getMapsByVirtualFile(virtualFile: VirtualFile) {

		if (!virtualFileMaps.has(virtualFile.snapshot)) {
			virtualFileMaps.set(virtualFile.snapshot, new Map());
		}

		updateVirtualFileMaps(virtualFile, sourceFileName => {
			if (sourceFileName) {
				const source = sourceFiles.get(normalizePath(sourceFileName))!;
				return [sourceFileName, source.snapshot];
			}
			else {
				const source = getVirtualFileToSourceFileMap().get(normalizePath(virtualFile.fileName))!.source;
				return [source.fileName, source.snapshot];
			}
		}, virtualFileMaps.get(virtualFile.snapshot));

		return virtualFileMaps.get(virtualFile.snapshot)!;
	}

	function getMirrorMap(file: VirtualFile) {
		if (!virtualFileToMirrorMap.has(file.snapshot)) {
			virtualFileToMirrorMap.set(file.snapshot, file.mirrorBehaviorMappings ? new MirrorMap(file.mirrorBehaviorMappings) : undefined);
		}
		return virtualFileToMirrorMap.get(file.snapshot);
	}
}

export function updateVirtualFileMaps(
	virtualFile: VirtualFile,
	getSourceSnapshot: (source: string | undefined) => [string, ts.IScriptSnapshot] | undefined,
	map: Map<string, [ts.IScriptSnapshot, SourceMap<FileRangeCapabilities>]> = new Map(),
) {

	const sources = new Set<string | undefined>();

	for (const mapping of virtualFile.mappings) {

		if (sources.has(mapping.source))
			continue;

		sources.add(mapping.source);

		const source = getSourceSnapshot(mapping.source);
		if (!source)
			continue;

		if (!map.has(source[0]) || map.get(source[0])![0] !== source[1]) {
			map.set(source[0], [source[1], new SourceMap(virtualFile.mappings.filter(mapping2 => mapping2.source === mapping.source))]);
		}
	}

	return map;
}

export function forEachEmbeddedFile(file: VirtualFile, cb: (embedded: VirtualFile) => void) {
	cb(file);
	for (const embeddedFile of file.embeddedFiles) {
		forEachEmbeddedFile(embeddedFile, cb);
	}
}

function normalizePath(fileName: string) {
	return fileName.replace(/\\/g, '/').toLowerCase();
}
