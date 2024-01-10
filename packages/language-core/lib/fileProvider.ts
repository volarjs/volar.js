import { SourceMap } from '@volar/source-map';
import type * as ts from 'typescript';
import { LinkedCodeMap } from './linkedCodeMap';
import type { CodeInformation, LanguagePlugin, SourceFile, VirtualFile } from './types';
import { FileMap } from './utils';

export type FileProvider = ReturnType<typeof createFileProvider>;

export function createFileProvider(languagePlugins: LanguagePlugin[], caseSensitive: boolean, sync: (sourceFileUri: string) => void) {

	const sourceFiles = new FileMap<SourceFile>(caseSensitive);
	const virtualFileToSourceFileMap = new WeakMap<VirtualFile, SourceFile>();
	const virtualFileToMaps = new WeakMap<ts.IScriptSnapshot, Map<string, [ts.IScriptSnapshot, SourceMap<CodeInformation>]>>();
	const virtualFileToLinkedCodeMap = new WeakMap<ts.IScriptSnapshot, LinkedCodeMap | undefined>();

	return {
		updateSourceFile(id: string, languageId: string, snapshot: ts.IScriptSnapshot): SourceFile {

			const value = sourceFiles.get(id);
			if (value) {
				if (value.languageId !== languageId) {
					// languageId changed
					this.deleteSourceFile(id);
					return this.updateSourceFile(id, languageId, snapshot);
				}
				else if (value.snapshot !== snapshot) {
					// updated
					value.snapshot = snapshot;
					if (value.generated) {
						value.generated.languagePlugin.updateVirtualFile(value.generated.virtualFile, snapshot, this);
						value.generated.idToFileMap.clear();
						for (const file of forEachEmbeddedFile(value.generated.virtualFile)) {
							value.generated.idToFileMap.set(file.id, file);
							virtualFileToSourceFileMap.set(file, value);
						}
					}
					return value;
				}
				else {
					// not changed
					return value;
				}
			}

			// created
			const sourceFile: SourceFile = { id, languageId, snapshot };
			sourceFiles.set(id, sourceFile);

			for (const languagePlugin of languagePlugins) {
				const virtualFile = languagePlugin.createVirtualFile(id, languageId, snapshot, this);
				if (virtualFile) {
					sourceFile.generated = {
						virtualFile,
						languagePlugin,
						idToFileMap: new Map(),
					};
					for (const file of forEachEmbeddedFile(virtualFile)) {
						sourceFile.generated.idToFileMap.set(file.id, file);
						virtualFileToSourceFileMap.set(file, sourceFile);
					}
					break;
				}
			}

			return sourceFile;
		},
		deleteSourceFile(id: string) {
			const value = sourceFiles.get(id);
			if (value) {
				if (value.generated) {
					value.generated.languagePlugin.disposeVirtualFile?.(value.generated.virtualFile, this);
				}
				sourceFiles.delete(id);
			}
		},
		getLinkedCodeMap(file: VirtualFile) {
			if (!virtualFileToLinkedCodeMap.has(file.snapshot)) {
				virtualFileToLinkedCodeMap.set(
					file.snapshot,
					file.linkedCodeMappings
						? new LinkedCodeMap(file.linkedCodeMappings)
						: undefined
				);
			}
			return virtualFileToLinkedCodeMap.get(file.snapshot);
		},
		getMaps(virtualFile: VirtualFile) {

			if (!virtualFileToMaps.has(virtualFile.snapshot)) {
				virtualFileToMaps.set(virtualFile.snapshot, new Map());
			}

			updateVirtualFileMaps(virtualFile, sourceFileId => {
				if (sourceFileId) {
					const sourceFile = sourceFiles.get(sourceFileId)!;
					return [sourceFileId, sourceFile.snapshot];
				}
				else {
					const sourceFile = virtualFileToSourceFileMap.get(virtualFile)!;
					return [sourceFile.id, sourceFile.snapshot];
				}
			}, virtualFileToMaps.get(virtualFile.snapshot));

			return virtualFileToMaps.get(virtualFile.snapshot)!;
		},
		getSourceFile(id: string) {
			sync(id);
			return sourceFiles.get(id);
		},
		getVirtualFile(sourceFileId: string, virtualFileId: string) {
			const sourceFile = this.getSourceFile(sourceFileId);
			if (sourceFile) {
				const virtualFile = sourceFile.generated?.idToFileMap.get(virtualFileId);
				return [virtualFile, sourceFile] as const;
			}
			return [undefined, undefined] as const;
		},
		getSourceFileOfVirtualFile(virtualFile: VirtualFile) {
			return virtualFileToSourceFileMap.get(virtualFile)!;
		},
	};
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
