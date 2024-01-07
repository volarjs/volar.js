import { SourceMap } from '@volar/source-map';
import type * as ts from 'typescript';
import { LinkedCodeMap } from './linkedCodeMap';
import type { CodeInformation, LanguagePlugin, SourceFile, VirtualFile } from './types';
import { FileMap } from './utils';

export type FileProvider = ReturnType<typeof createFileProvider>;

export function createFileProvider(languagePlugins: LanguagePlugin[], caseSensitive: boolean, sync: (sourceFileUri: string) => void) {

	const sourceFileRegistry = new FileMap<SourceFile>(caseSensitive);
	const virtualFileRegistry = new FileMap<[VirtualFile, SourceFile]>(caseSensitive);
	const virtualFileToMaps = new WeakMap<ts.IScriptSnapshot, Map<string, [ts.IScriptSnapshot, SourceMap<CodeInformation>]>>();
	const virtualFileToLinkedCodeMap = new WeakMap<ts.IScriptSnapshot, LinkedCodeMap | undefined>();

	return {
		updateSourceFile(uri: string, languageId: string, snapshot: ts.IScriptSnapshot): SourceFile {

			const value = sourceFileRegistry.get(uri);
			if (value) {
				if (value.languageId !== languageId) {
					// languageId changed
					this.deleteSourceFile(uri);
					return this.updateSourceFile(uri, languageId, snapshot);
				}
				else if (value.snapshot !== snapshot) {
					// updated
					value.snapshot = snapshot;
					if (value.virtualFile) {
						disposeVirtualFiles(value);
						value.virtualFile[1].updateVirtualFile(value.virtualFile[0], snapshot, this);
						updateVirtualFiles(value);
					}
					return value;
				}
				else {
					// not changed
					return value;
				}
			}

			for (const language of languagePlugins) {
				const virtualFile = language.createVirtualFile(uri, languageId, snapshot, this);
				if (virtualFile) {
					// created
					const source: SourceFile = {
						uri,
						languageId,
						snapshot,
						virtualFile: [virtualFile, language],
					};
					sourceFileRegistry.set(uri, source);
					updateVirtualFiles(source);
					return source;
				}
			}

			const source: SourceFile = { uri, languageId, snapshot };
			sourceFileRegistry.set(uri, source);
			return source;
		},
		deleteSourceFile(uri: string) {
			const value = sourceFileRegistry.get(uri);
			if (value) {
				if (value.virtualFile) {
					value.virtualFile[1].disposeVirtualFile?.(value.virtualFile[0], this);
				}
				sourceFileRegistry.delete(uri); // deleted
				disposeVirtualFiles(value);
			}
		},
		getLinkedCodeMap(file: VirtualFile) {
			if (!virtualFileToLinkedCodeMap.has(file.snapshot)) {
				virtualFileToLinkedCodeMap.set(file.snapshot, file.linkedCodeMappings ? new LinkedCodeMap(file.linkedCodeMappings) : undefined);
			}
			return virtualFileToLinkedCodeMap.get(file.snapshot);
		},
		getMaps(virtualFile: VirtualFile) {

			if (!virtualFileToMaps.has(virtualFile.snapshot)) {
				virtualFileToMaps.set(virtualFile.snapshot, new Map());
			}

			updateVirtualFileMaps(virtualFile, sourceFileUri => {
				if (sourceFileUri) {
					const sourceFile = sourceFileRegistry.get(sourceFileUri)!;
					return [sourceFileUri, sourceFile.snapshot];
				}
				else {
					const sourceFile = virtualFileRegistry.get(virtualFile.uri)![1];
					return [sourceFile.uri, sourceFile.snapshot];
				}
			}, virtualFileToMaps.get(virtualFile.snapshot));

			return virtualFileToMaps.get(virtualFile.snapshot)!;
		},
		getSourceFile(uri: string) {
			sync(uri);
			return sourceFileRegistry.get(uri);
		},
		getVirtualFile(uri: string) {
			let sourceAndVirtual = virtualFileRegistry.get(uri);
			if (sourceAndVirtual) {
				sync(sourceAndVirtual[1].uri);
				sourceAndVirtual = virtualFileRegistry.get(uri);
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
				virtualFileRegistry.delete(file.uri);
			}
		}
	}

	function updateVirtualFiles(source: SourceFile) {
		if (source.virtualFile) {
			for (const file of forEachEmbeddedFile(source.virtualFile[0])) {
				virtualFileRegistry.set(file.uri, [file, source]);
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

		if (sources.has(mapping.source)) {
			continue;
		}

		sources.add(mapping.source);

		const source = getSourceSnapshot(mapping.source);
		if (!source) {
			continue;
		}

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
