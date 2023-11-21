import { FileProvider, CodeInformation, MirrorCodeInformation, MirrorMap, SourceFile, VirtualFile, forEachEmbeddedFile } from '@volar/language-core';
import { Mapping, SourceMap } from '@volar/source-map';
import type * as ts from 'typescript/lib/tsserverlibrary';
import type * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';

export type DocumentProvider = ReturnType<typeof createDocumentProvider>;

export class SourceMapWithDocuments<Data = any> {

	constructor(
		public sourceFileDocument: TextDocument,
		public virtualFileDocument: TextDocument,
		public map: SourceMap<Data>,
	) { }

	// Range APIs

	public toSourceRange(range: vscode.Range, filter: (data: Data) => boolean = () => true) {
		for (const result of this.toSourceRanges(range, filter)) {
			return result;
		}
	}

	public toGeneratedRange(range: vscode.Range, filter: (data: Data) => boolean = () => true) {
		for (const result of this.toGeneratedRanges(range, filter)) {
			return result;
		}
	}

	public * toSourceRanges(range: vscode.Range, filter: (data: Data) => boolean = () => true) {
		for (const result of this.toRanges(range, filter, 'toSourcePositionsBase', 'matchSourcePosition')) {
			yield result;
		}
	}

	public * toGeneratedRanges(range: vscode.Range, filter: (data: Data) => boolean = () => true) {
		for (const result of this.toRanges(range, filter, 'toGeneratedPositionsBase', 'matchGeneratedPosition')) {
			yield result;
		}
	}

	protected * toRanges(
		range: vscode.Range,
		filter: (data: Data) => boolean,
		api: 'toSourcePositionsBase' | 'toGeneratedPositionsBase',
		api2: 'matchSourcePosition' | 'matchGeneratedPosition'
	) {
		const failedLookUps: (readonly [vscode.Position, Mapping<Data>])[] = [];
		for (const mapped of this[api](range.start, filter, 'left')) {
			const end = this[api2](range.end, mapped[1], 'right');
			if (end) {
				yield { start: mapped[0], end } as vscode.Range;
			}
			else {
				failedLookUps.push(mapped);
			}
		}
		for (const failedLookUp of failedLookUps) {
			for (const mapped of this[api](range.end, filter, 'right')) {
				yield { start: failedLookUp[0], end: mapped[0] } as vscode.Range;
			}
		}
	}

	// Position APIs

	public toSourcePosition(position: vscode.Position, filter: (data: Data) => boolean = () => true, baseOffset?: 'left' | 'right') {
		for (const mapped of this.toSourcePositions(position, filter, baseOffset)) {
			return mapped;
		}
	}

	public toGeneratedPosition(position: vscode.Position, filter: (data: Data) => boolean = () => true, baseOffset?: 'left' | 'right') {
		for (const mapped of this.toGeneratedPositions(position, filter, baseOffset)) {
			return mapped;
		}
	}

	public * toSourcePositions(position: vscode.Position, filter: (data: Data) => boolean = () => true, baseOffset?: 'left' | 'right') {
		for (const mapped of this.toSourcePositionsBase(position, filter, baseOffset)) {
			yield mapped[0];
		}
	}

	public * toGeneratedPositions(position: vscode.Position, filter: (data: Data) => boolean = () => true, baseOffset?: 'left' | 'right') {
		for (const mapped of this.toGeneratedPositionsBase(position, filter, baseOffset)) {
			yield mapped[0];
		}
	}

	public * toSourcePositionsBase(position: vscode.Position, filter: (data: Data) => boolean = () => true, baseOffset?: 'left' | 'right') {
		let hasResult = false;
		for (const mapped of this.toPositions(position, filter, this.virtualFileDocument, this.sourceFileDocument, 'generatedRange', 'sourceRange', baseOffset ?? 'left')) {
			hasResult = true;
			yield mapped;
		}
		if (!hasResult && baseOffset === undefined) {
			for (const mapped of this.toPositions(position, filter, this.virtualFileDocument, this.sourceFileDocument, 'generatedRange', 'sourceRange', 'right')) {
				yield mapped;
			}
		}
	}

	public * toGeneratedPositionsBase(position: vscode.Position, filter: (data: Data) => boolean = () => true, baseOffset?: 'left' | 'right') {
		let hasResult = false;
		for (const mapped of this.toPositions(position, filter, this.sourceFileDocument, this.virtualFileDocument, 'sourceRange', 'generatedRange', baseOffset ?? 'left')) {
			hasResult = true;
			yield mapped;
		}
		if (!hasResult && baseOffset === undefined) {
			for (const mapped of this.toPositions(position, filter, this.sourceFileDocument, this.virtualFileDocument, 'sourceRange', 'generatedRange', 'right')) {
				yield mapped;
			}
		}
	}

	protected * toPositions(
		position: vscode.Position,
		filter: (data: Data) => boolean,
		fromDoc: TextDocument,
		toDoc: TextDocument,
		from: 'sourceRange' | 'generatedRange',
		to: 'sourceRange' | 'generatedRange',
		baseOffset: 'left' | 'right',
	) {
		for (const mapped of this.map.matching(fromDoc.offsetAt(position), from, to, baseOffset === 'right')) {
			if (!filter(mapped[1].data)) {
				continue;
			}
			yield [toDoc.positionAt(mapped[0]), mapped[1]] as const;
		}
	}

	protected matchSourcePosition(position: vscode.Position, mapping: Mapping, baseOffset: 'left' | 'right') {
		let offset = this.map.matchOffset(this.virtualFileDocument.offsetAt(position), mapping['generatedRange'], mapping['sourceRange'], baseOffset === 'right');
		if (offset !== undefined) {
			return this.sourceFileDocument.positionAt(offset);
		}
	}

	protected matchGeneratedPosition(position: vscode.Position, mapping: Mapping, baseOffset: 'left' | 'right') {
		let offset = this.map.matchOffset(this.sourceFileDocument.offsetAt(position), mapping['sourceRange'], mapping['generatedRange'], baseOffset === 'right');
		if (offset !== undefined) {
			return this.virtualFileDocument.positionAt(offset);
		}
	}
}

export class MirrorMapWithDocument extends SourceMapWithDocuments<[MirrorCodeInformation, MirrorCodeInformation]> {
	constructor(
		public document: TextDocument,
		map: MirrorMap,
	) {
		super(document, document, map);
	}
	*findMirrorPositions(start: vscode.Position) {
		for (const mapped of this.toGeneratedPositionsBase(start)) {
			yield [mapped[0], mapped[1].data[1]] as const;
		}
		for (const mapped of this.toSourcePositionsBase(start)) {
			yield [mapped[0], mapped[1].data[0]] as const;
		}
	}
}

export function createDocumentProvider(fileProvider: FileProvider) {

	let version = 0;

	const map2DocMap = new WeakMap<SourceMap<CodeInformation>, SourceMapWithDocuments<CodeInformation>>();
	const mirrorMap2DocMirrorMap = new WeakMap<MirrorMap, MirrorMapWithDocument>();
	const snapshot2Doc = new WeakMap<ts.IScriptSnapshot, Map<string, TextDocument>>();

	return {
		get,
		getSourceFileMaps(source: SourceFile) {
			if (source.virtualFile) {
				const result: [VirtualFile, SourceMapWithDocuments<CodeInformation>][] = [];
				for (const virtualFile of forEachEmbeddedFile(source.virtualFile[0])) {
					for (const [sourceUri, [sourceSnapshot, map]] of fileProvider.getMaps(virtualFile)) {
						if (sourceSnapshot === source.snapshot) {
							if (!map2DocMap.has(map)) {
								map2DocMap.set(map, new SourceMapWithDocuments(
									get(sourceUri, source.languageId, sourceSnapshot),
									get(virtualFile.id, virtualFile.languageId, virtualFile.snapshot),
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
			for (const [sourceUri, [sourceSnapshot, map]] of fileProvider.getMaps(virtualFile)) {
				if (!map2DocMap.has(map)) {
					map2DocMap.set(map, new SourceMapWithDocuments(
						get(sourceUri, fileProvider.getSourceFile(sourceUri)!.languageId, sourceSnapshot),
						get(virtualFile.id, virtualFile.languageId, virtualFile.snapshot),
						map,
					));
				}
				yield map2DocMap.get(map)!;
			}
		},
		getMirrorMap(virtualFile: VirtualFile) {
			const map = fileProvider.getMirrorMap(virtualFile);
			if (map) {
				if (!mirrorMap2DocMirrorMap.has(map)) {
					mirrorMap2DocMirrorMap.set(map, new MirrorMapWithDocument(
						get(virtualFile.id, virtualFile.languageId, virtualFile.snapshot),
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
