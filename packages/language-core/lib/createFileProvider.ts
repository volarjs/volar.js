import { SourceMap } from '@volar/source-map';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { MirrorMap } from './mirrorMap';
import type { FileRangeCapabilities, Language, VirtualFile } from './types';

export interface Source {
	fileName: string;
	languageId: string;
	snapshot: ts.IScriptSnapshot;
	root?: VirtualFile;
	language?: Language;
}

export function createFileProvider(languages: Language[], sync: (fileName: string) => void) {

	const sourceFiles = new Map<string, Source>();
	const virtualFiles = new Map<string, { virtualFile: VirtualFile, source: Source; }>();
	const virtualFileMaps = new WeakMap<ts.IScriptSnapshot, Map<string, [ts.IScriptSnapshot, SourceMap<FileRangeCapabilities>]>>();
	const virtualFileToMirrorMap = new WeakMap<ts.IScriptSnapshot, MirrorMap | undefined>();

	return {
		sourceFiles,
		updateSource(fileName: string, snapshot: ts.IScriptSnapshot, languageId: string): VirtualFile | undefined {
			const key = normalizePath(fileName);
			const value = sourceFiles.get(key);
			if (value) {
				if (value.languageId !== languageId) {
					// languageId changed
					this.deleteSource(fileName);
					return this.updateSource(fileName, snapshot, languageId);
				}
				else if (value.snapshot !== snapshot) {
					value.snapshot = snapshot;
					if (value.root && value.language) {
						deleteVirtualFiles(value);
						value.language.updateVirtualFile(value.root, snapshot);
						updateVirtualFiles(value);
					}
					return value.root; // updated
				}
				else {
					return value.root; // no change
				}
			}
			for (const language of languages) {
				const virtualFile = language.createVirtualFile(fileName, snapshot, languageId);
				if (virtualFile) {
					const source: Source = { fileName, languageId, snapshot, root: virtualFile, language };
					sourceFiles.set(key, source);
					updateVirtualFiles(source);
					return virtualFile; // created
				}
			}
			sourceFiles.set(key, { fileName, languageId, snapshot });
		},
		deleteSource(fileName: string) {
			const key = normalizePath(fileName);
			const value = sourceFiles.get(key);
			if (value) {
				if (value.language && value.root) {
					value.language.deleteVirtualFile?.(value.root);
				}
				sourceFiles.delete(key); // deleted
				deleteVirtualFiles(value);
			}
		},
		getMirrorMap(file: VirtualFile) {
			if (!virtualFileToMirrorMap.has(file.snapshot)) {
				virtualFileToMirrorMap.set(file.snapshot, file.mirrorBehaviorMappings ? new MirrorMap(file.mirrorBehaviorMappings) : undefined);
			}
			return virtualFileToMirrorMap.get(file.snapshot);
		},
		getMaps(virtualFile: VirtualFile) {

			if (!virtualFileMaps.has(virtualFile.snapshot)) {
				virtualFileMaps.set(virtualFile.snapshot, new Map());
			}

			updateVirtualFileMaps(virtualFile, sourceFileName => {
				if (sourceFileName) {
					const source = sourceFiles.get(normalizePath(sourceFileName))!;
					return [sourceFileName, source.snapshot];
				}
				else {
					const source = virtualFiles.get(normalizePath(virtualFile.fileName))!.source;
					return [source.fileName, source.snapshot];
				}
			}, virtualFileMaps.get(virtualFile.snapshot));

			return virtualFileMaps.get(virtualFile.snapshot)!;
		},
		getSource(fileName: string) {
			sync(fileName);
			const key = normalizePath(fileName);
			return sourceFiles.get(key);
		},
		hasSource(fileName: string) {
			sync(fileName);
			return sourceFiles.has(normalizePath(fileName));
		},
		hasVirtualFile(fileName: string) {
			sync(fileName);
			return !!virtualFiles.get(normalizePath(fileName));
		},
		getVirtualFile(fileName: string) {
			sync(fileName);
			const sourceAndVirtual = virtualFiles.get(normalizePath(fileName));
			if (sourceAndVirtual) {
				return [sourceAndVirtual.virtualFile, sourceAndVirtual.source] as const;
			}
			return [undefined, undefined] as const;
		},
	};

	function deleteVirtualFiles(source: Source) {
		if (source.root) {
			forEachEmbeddedFile(source.root, file => {
				virtualFiles.delete(normalizePath(file.fileName));
			});
		}
	}

	function updateVirtualFiles(source: Source) {
		if (source.root) {
			forEachEmbeddedFile(source.root, file => {
				virtualFiles.set(normalizePath(file.fileName), { virtualFile: file, source });
			});
		}
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
