import { CodeRangeKey, LinkedCodeMap, Mapping, SourceMap, translateOffset } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';

export class SourceMapWithDocuments<Data = any> {

	constructor(
		public sourceDocument: TextDocument,
		public embeddedDocument: TextDocument,
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
		for (const mapped of this.findPositions(position, filter, this.embeddedDocument, this.sourceDocument, 'generatedOffsets', 'sourceOffsets')) {
			yield mapped;
		}
	}

	public * getGeneratedPositionsBase(position: vscode.Position, filter: (data: Data) => boolean = () => true) {
		for (const mapped of this.findPositions(position, filter, this.sourceDocument, this.embeddedDocument, 'sourceOffsets', 'generatedOffsets')) {
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
		let offset = translateOffset(this.embeddedDocument.offsetAt(position), mapping.generatedOffsets, mapping.sourceOffsets, mapping.lengths);
		if (offset !== undefined) {
			return this.sourceDocument.positionAt(offset);
		}
	}

	protected matchGeneratedPosition(position: vscode.Position, mapping: Mapping) {
		let offset = translateOffset(this.sourceDocument.offsetAt(position), mapping.sourceOffsets, mapping.generatedOffsets, mapping.lengths);
		if (offset !== undefined) {
			return this.embeddedDocument.positionAt(offset);
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
