import { CodeInformation, CodeRangeKey, FileProvider, LinkedCodeMap, Mapping, SourceFile, SourceMap, VirtualFile, forEachEmbeddedFile, translateOffset } from '@volar/language-core';
import type * as ts from 'typescript';
import type * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { RuntimeEnvironment } from '../lib/types';

export type DocumentProvider = ReturnType<typeof createDocumentProvider>;

export class SourceMapWithDocuments<Data = any> {

	constructor(
		public sourceFileDocument: TextDocument,
		public virtualFileDocument: TextDocument,
		public map: SourceMap<Data>,
	) { }

	// Range APIs

	public getSourceRange(range: vscode.Range, filter: (data: Data) => boolean = () => true) {
		for (const result of this.getSourceRanges(range, filter)) {
			return result;
		}
	}

	public getGeneratedRange(range: vscode.Range, filter: (data: Data) => boolean = () => true) {
		for (const result of this.getGeneratedRanges(range, filter)) {
			return result;
		}
	}

	public * getSourceRanges(range: vscode.Range, filter: (data: Data) => boolean = () => true) {
		for (const result of this.findRanges(range, filter, 'getSourcePositionsBase', 'matchSourcePosition')) {
			yield result;
		}
	}

	public * getGeneratedRanges(range: vscode.Range, filter: (data: Data) => boolean = () => true) {
		for (const result of this.findRanges(range, filter, 'getGeneratedPositionsBase', 'matchGeneratedPosition')) {
			yield result;
		}
	}

	protected * findRanges(
		range: vscode.Range,
		filter: (data: Data) => boolean,
		api: 'getSourcePositionsBase' | 'getGeneratedPositionsBase',
		api2: 'matchSourcePosition' | 'matchGeneratedPosition'
	) {
		const failedLookUps: (readonly [vscode.Position, Mapping<Data>])[] = [];
		for (const mapped of this[api](range.start, filter)) {
			const end = this[api2](range.end, mapped[1]);
			if (end) {
				yield { start: mapped[0], end } as vscode.Range;
			}
			else {
				failedLookUps.push(mapped);
			}
		}
		for (const failedLookUp of failedLookUps) {
			for (const mapped of this[api](range.end, filter)) {
				yield { start: failedLookUp[0], end: mapped[0] } as vscode.Range;
			}
		}
	}

	// Position APIs

	public getSourcePosition(position: vscode.Position, filter: (data: Data) => boolean = () => true) {
		for (const mapped of this.getSourcePositions(position, filter)) {
			return mapped;
		}
	}

	public getGeneratedPosition(position: vscode.Position, filter: (data: Data) => boolean = () => true) {
		for (const mapped of this.getGeneratedPositions(position, filter)) {
			return mapped;
		}
	}

	public * getSourcePositions(position: vscode.Position, filter: (data: Data) => boolean = () => true) {
		for (const mapped of this.getSourcePositionsBase(position, filter)) {
			yield mapped[0];
		}
	}

	public * getGeneratedPositions(position: vscode.Position, filter: (data: Data) => boolean = () => true) {
		for (const mapped of this.getGeneratedPositionsBase(position, filter)) {
			yield mapped[0];
		}
	}

	public * getSourcePositionsBase(position: vscode.Position, filter: (data: Data) => boolean = () => true) {
		for (const mapped of this.findPositions(position, filter, this.virtualFileDocument, this.sourceFileDocument, 'generatedOffsets', 'sourceOffsets')) {
			yield mapped;
		}
	}

	public * getGeneratedPositionsBase(position: vscode.Position, filter: (data: Data) => boolean = () => true) {
		for (const mapped of this.findPositions(position, filter, this.sourceFileDocument, this.virtualFileDocument, 'sourceOffsets', 'generatedOffsets')) {
			yield mapped;
		}
	}

	protected * findPositions(
		position: vscode.Position,
		filter: (data: Data) => boolean,
		fromDoc: TextDocument,
		toDoc: TextDocument,
		from: CodeRangeKey,
		to: CodeRangeKey
	) {
		for (const mapped of this.map.findMatching(fromDoc.offsetAt(position), from, to)) {
			if (!filter(mapped[1].data)) {
				continue;
			}
			yield [toDoc.positionAt(mapped[0]), mapped[1]] as const;
		}
	}

	protected matchSourcePosition(position: vscode.Position, mapping: Mapping) {
		let offset = translateOffset(this.virtualFileDocument.offsetAt(position), mapping.generatedOffsets, mapping.sourceOffsets, mapping.lengths);
		if (offset !== undefined) {
			return this.sourceFileDocument.positionAt(offset);
		}
	}

	protected matchGeneratedPosition(position: vscode.Position, mapping: Mapping) {
		let offset = translateOffset(this.sourceFileDocument.offsetAt(position), mapping.sourceOffsets, mapping.generatedOffsets, mapping.lengths);
		if (offset !== undefined) {
			return this.virtualFileDocument.positionAt(offset);
		}
	}
}

export class LinkedCodeMapWithDocument extends SourceMapWithDocuments {
	constructor(
		public document: TextDocument,
		private linkedMap: LinkedCodeMap,
	) {
		super(document, document, linkedMap);
	}
	*getLinkedCodePositions(posotion: vscode.Position) {
		for (const linkedPosition of this.linkedMap.getLinkedOffsets(this.document.offsetAt(posotion))) {
			yield this.document.positionAt(linkedPosition);
		}
	}
}

export function createDocumentProvider(env: RuntimeEnvironment, files: FileProvider) {

	let version = 0;

	const map2DocMap = new WeakMap<SourceMap<CodeInformation>, SourceMapWithDocuments<CodeInformation>>();
	const mirrorMap2DocMirrorMap = new WeakMap<LinkedCodeMap, LinkedCodeMapWithDocument>();
	const snapshot2Doc = new WeakMap<ts.IScriptSnapshot, Map<string, TextDocument>>();

	return {
		get,
		getSourceFileMaps(source: SourceFile) {
			if (source.virtualFile) {
				const result: [VirtualFile, SourceMapWithDocuments<CodeInformation>][] = [];
				for (const virtualFile of forEachEmbeddedFile(source.virtualFile[0])) {
					for (const [sourceUri, [sourceSnapshot, map]] of files.getMaps(virtualFile)) {
						if (sourceSnapshot === source.snapshot) {
							if (!map2DocMap.has(map)) {
								map2DocMap.set(map, new SourceMapWithDocuments(
									get(sourceUri, source.languageId, sourceSnapshot),
									get(env.fileNameToUri(virtualFile.fileName), virtualFile.languageId, virtualFile.snapshot),
									map,
								));
							}
							result.push([virtualFile, map2DocMap.get(map)!]);
						}
					}
				}
				return result;
			}
		},
		*getMaps(virtualFile: VirtualFile) {
			for (const [sourceFileName, [sourceSnapshot, map]] of files.getMaps(virtualFile)) {
				if (!map2DocMap.has(map)) {
					map2DocMap.set(map, new SourceMapWithDocuments(
						get(env.fileNameToUri(sourceFileName), files.getSourceFile(sourceFileName)!.languageId, sourceSnapshot),
						get(env.fileNameToUri(virtualFile.fileName), virtualFile.languageId, virtualFile.snapshot),
						map,
					));
				}
				yield map2DocMap.get(map)!;
			}
		},
		getLinkedCodeMap(virtualFile: VirtualFile) {
			const map = files.getLinkedCodeMap(virtualFile);
			if (map) {
				if (!mirrorMap2DocMirrorMap.has(map)) {
					mirrorMap2DocMirrorMap.set(map, new LinkedCodeMapWithDocument(
						get(env.fileNameToUri(virtualFile.fileName), virtualFile.languageId, virtualFile.snapshot),
						map,
					));
				}
				return mirrorMap2DocMirrorMap.get(map)!;
			}
		},
	};

	function get(uri: string, languageId: string, snapshot: ts.IScriptSnapshot) {
		if (!snapshot2Doc.has(snapshot)) {
			snapshot2Doc.set(snapshot, new Map());
		}
		const map = snapshot2Doc.get(snapshot)!;
		if (!map.has(uri)) {
			map.set(uri, TextDocument.create(
				uri,
				languageId,
				version++,
				snapshot.getText(0, snapshot.getLength()),
			));
		}
		return map.get(uri)!;
	}
}
