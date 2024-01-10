import { SourceMap } from '@volar/source-map';
import type * as ts from 'typescript';
import { LinkedCodeMap } from './linkedCodeMap';
import type { CodeInformation, LanguagePlugin, SourceFile, VirtualFile } from './types';
import { FileMap } from './utils';

export type FileProvider = ReturnType<typeof createFileProvider>;

export function createFileProvider(languagePlugins: LanguagePlugin[], caseSensitive: boolean, sync: (sourceFileUri: string) => void) {

	const sourceFiles = new FileMap<SourceFile>(caseSensitive);
	const virtualFileToSourceFileMap = new WeakMap<VirtualFile, [uri: string, SourceFile]>();
	const virtualFileToMaps = new WeakMap<ts.IScriptSnapshot, Map<string, [ts.IScriptSnapshot, SourceMap<CodeInformation>]>>();
	const virtualFileToLinkedCodeMap = new WeakMap<ts.IScriptSnapshot, LinkedCodeMap | undefined>();

	return {
		updateSourceFile(uri: string, languageId: string, snapshot: ts.IScriptSnapshot): SourceFile {

			const value = sourceFiles.get(uri);
			if (value) {
				if (value.languageId !== languageId) {
					// languageId changed
					this.deleteSourceFile(uri);
					return this.updateSourceFile(uri, languageId, snapshot);
				}
				else if (value.snapshot !== snapshot) {
					// updated
					value.snapshot = snapshot;
					if (value.generated) {
						value.generated.languagePlugin.updateVirtualFile(value.generated.virtualFile, snapshot, this);
						value.generated.idToFileMap.clear();
						for (const file of forEachEmbeddedFile(value.generated.virtualFile)) {
							value.generated.idToFileMap.set(file.id, file);
							virtualFileToSourceFileMap.set(file, [uri, value]);
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
			const sourceFile: SourceFile = { languageId, snapshot };
			sourceFiles.set(uri, sourceFile);

			for (const languagePlugin of languagePlugins) {
				const virtualFile = languagePlugin.createVirtualFile(uri, languageId, snapshot, this);
				if (virtualFile) {
					sourceFile.generated = {
						virtualFile,
						languagePlugin,
						idToFileMap: new Map(),
					};
					for (const file of forEachEmbeddedFile(virtualFile)) {
						sourceFile.generated.idToFileMap.set(file.id, file);
						virtualFileToSourceFileMap.set(file, [uri, sourceFile]);
					}
					break;
				}
			}

			return sourceFile;
		},
		deleteSourceFile(uri: string) {
			const value = sourceFiles.get(uri);
			if (value) {
				if (value.generated) {
					value.generated.languagePlugin.disposeVirtualFile?.(value.generated.virtualFile, this);
				}
				sourceFiles.delete(uri); // deleted
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

			updateVirtualFileMaps(virtualFile, sourceFileUri => {
				if (sourceFileUri) {
					const sourceFile = sourceFiles.get(sourceFileUri)!;
					return [sourceFileUri, sourceFile.snapshot];
				}
				else {
					const [uri, sourceFile] = virtualFileToSourceFileMap.get(virtualFile)!;
					return [uri, sourceFile.snapshot];
				}
			}, virtualFileToMaps.get(virtualFile.snapshot));

			return virtualFileToMaps.get(virtualFile.snapshot)!;
		},
		getSourceFile(uri: string) {
			sync(uri);
			return sourceFiles.get(uri);
		},
		getVirtualFile(sourceFileUri: string, virtualFileId: string) {
			const sourceFile = this.getSourceFile(sourceFileUri);
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
