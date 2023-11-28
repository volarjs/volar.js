import { SourceMap } from '@volar/source-map';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { LinkedCodeMap } from './linkedCodeMap';
import type { CodeInformation, Language, SourceFile, VirtualFile } from './types';
import { FileMap } from './utils';

export type FileProvider = ReturnType<typeof createFileProvider>;

export function createFileProvider(languages: Language[], caseSensitive: boolean, sync: (sourceFileId: string) => void) {

	const sourceFileRegistry = new FileMap<SourceFile>(caseSensitive);
	const virtualFileRegistry = new FileMap<[VirtualFile, SourceFile]>(caseSensitive);
	const virtualFileToMaps = new WeakMap<ts.IScriptSnapshot, Map<string, [ts.IScriptSnapshot, SourceMap<CodeInformation>]>>();
	const virtualFileToLinkedCodeMap = new WeakMap<ts.IScriptSnapshot, LinkedCodeMap | undefined>();

	return {
		updateSourceFile(id: string, snapshot: ts.IScriptSnapshot, languageId: string): SourceFile {

			const value = sourceFileRegistry.get(id);
			if (value) {
				if (value.languageId !== languageId) {
					// languageId changed
					this.deleteSourceFile(id);
					return this.updateSourceFile(id, snapshot, languageId);
				}
				else if (value.snapshot !== snapshot) {
					// updated
					value.snapshot = snapshot;
					if (value.virtualFile) {
						disposeVirtualFiles(value);
						value.virtualFile[1].updateVirtualFile(value.virtualFile[0], snapshot);
						updateVirtualFiles(value);
					}
					return value;
				}
				else {
					// not changed
					return value;
				}
			}

			for (const language of languages) {
				const virtualFile = language.createVirtualFile(id, languageId, snapshot);
				if (virtualFile) {
					// created
					const source: SourceFile = {
						id,
						languageId,
						snapshot,
						virtualFile: [virtualFile, language],
					};
					sourceFileRegistry.set(id, source);
					updateVirtualFiles(source);
					return source;
				}
			}

			const source: SourceFile = { id: id, languageId, snapshot };
			sourceFileRegistry.set(id, source);
			return source;
		},
		deleteSourceFile(id: string) {
			const value = sourceFileRegistry.get(id);
			if (value) {
				if (value.virtualFile) {
					value.virtualFile[1].disposeVirtualFile?.(value.virtualFile[0]);
				}
				sourceFileRegistry.delete(id); // deleted
				disposeVirtualFiles(value);
			}
		},
		getMirrorMap(file: VirtualFile) {
			if (!virtualFileToLinkedCodeMap.has(file.snapshot)) {
				virtualFileToLinkedCodeMap.set(file.snapshot, file.linkedNavigationMappings ? new LinkedCodeMap(file.linkedNavigationMappings) : undefined);
			}
			return virtualFileToLinkedCodeMap.get(file.snapshot);
		},
		getMaps(virtualFile: VirtualFile) {

			if (!virtualFileToMaps.has(virtualFile.snapshot)) {
				virtualFileToMaps.set(virtualFile.snapshot, new Map());
			}

			updateVirtualFileMaps(virtualFile, sourceId => {
				if (sourceId) {
					const sourceFile = sourceFileRegistry.get(sourceId)!;
					return [sourceId, sourceFile.snapshot];
				}
				else {
					const sourceFile = virtualFileRegistry.get(virtualFile.id)![1];
					return [sourceFile.id, sourceFile.snapshot];
				}
			}, virtualFileToMaps.get(virtualFile.snapshot));

			return virtualFileToMaps.get(virtualFile.snapshot)!;
		},
		getSourceFile(id: string) {
			sync(id);
			return sourceFileRegistry.get(id);
		},
		getVirtualFile(id: string) {
			let sourceAndVirtual = virtualFileRegistry.get(id);
			if (sourceAndVirtual) {
				sync(sourceAndVirtual[1].id);
				sourceAndVirtual = virtualFileRegistry.get(id);
				if (sourceAndVirtual) {
					return sourceAndVirtual;
				}
			}
			return [undefined, undefined] as const;
		},
	};

	function disposeVirtualFiles(source: SourceFile) {
		if (source.virtualFile) {
			for (const file of forEachEmbeddedFile(source.virtualFile[0])) {
				virtualFileRegistry.delete(file.id);
			}
		}
	}

	function updateVirtualFiles(source: SourceFile) {
		if (source.virtualFile) {
			for (const file of forEachEmbeddedFile(source.virtualFile[0])) {
				virtualFileRegistry.set(file.id, [file, source]);
			}
		}
	}
}

export function updateVirtualFileMaps(
	virtualFile: VirtualFile,
	getSourceSnapshot: (sourceUri: string | undefined) => [string, ts.IScriptSnapshot] | undefined,
	map: Map<string, [ts.IScriptSnapshot, SourceMap<CodeInformation>]> = new Map(),
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

export function* forEachEmbeddedFile(file: VirtualFile): Generator<VirtualFile> {
	yield file;
	for (const embeddedFile of file.embeddedFiles) {
		yield* forEachEmbeddedFile(embeddedFile);
	}
}
