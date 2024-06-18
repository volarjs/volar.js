import { CodeInformation, CodeRangeKey, LinkedCodeMap, Mapping, SourceMap, VirtualCode, translateOffset } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';

export class SourceMapWithDocuments {

	constructor(
		public sourceDocument: TextDocument,
		public embeddedDocument: TextDocument,
		public map: SourceMap<CodeInformation>,
		public virtualCode?: VirtualCode,
	) { }

	// Range APIs

	public getSourceRange(range: vscode.Range, filter: (data: CodeInformation) => boolean = () => true) {
		for (const result of this.getSourceRanges(range, filter)) {
			return result;
		}
	}

	public getGeneratedRange(range: vscode.Range, filter: (data: CodeInformation) => boolean = () => true) {
		for (const result of this.getGeneratedRanges(range, filter)) {
			return result;
		}
	}

	public * getSourceRanges(range: vscode.Range, filter: (data: CodeInformation) => boolean = () => true) {
		for (const result of this.findRanges(range, filter, this.embeddedDocument, this.sourceDocument, 'getSourceStartEnd', 'getSourcePositions')) {
			yield result;
		}
	}

	public * getGeneratedRanges(range: vscode.Range, filter: (data: CodeInformation) => boolean = () => true) {
		for (const result of this.findRanges(range, filter, this.sourceDocument, this.embeddedDocument, 'getGeneratedStartEnd', 'getGeneratedPositions')) {
			yield result;
		}
	}

	protected * findRanges(
		range: vscode.Range,
		filter: (data: CodeInformation) => boolean,
		fromDoc: TextDocument,
		toDoc: TextDocument,
		api: 'getSourceStartEnd' | 'getGeneratedStartEnd',
		api2: 'getSourcePositions' | 'getGeneratedPositions'
	) {
		for (const [mappedStart, mappedEnd, mapping] of this.map[api](fromDoc.offsetAt(range.start), fromDoc.offsetAt(range.end))) {
			if (!filter(mapping.data)) {
				continue;
			}
			yield { start: toDoc.positionAt(mappedStart), end: toDoc.positionAt(mappedEnd) };
		}
		for (const mappedStart of this[api2](range.start, filter)) {
			for (const mappedEnd of this[api2](range.end, filter)) {
				yield { start: mappedStart, end: mappedEnd };
				break;
			}
		}
	}

	public * getSourcePositions(position: vscode.Position, filter: (data: CodeInformation) => boolean = () => true) {
		for (const mapped of this.findPositions(position, filter, this.embeddedDocument, this.sourceDocument, 'generatedOffsets', 'sourceOffsets')) {
			yield mapped[0];
		}
	}

	public * getGeneratedPositions(position: vscode.Position, filter: (data: CodeInformation) => boolean = () => true) {
		for (const mapped of this.findPositions(position, filter, this.sourceDocument, this.embeddedDocument, 'sourceOffsets', 'generatedOffsets')) {
			yield mapped[0];
		}
	}

	protected * findPositions(
		position: vscode.Position,
		filter: (data: CodeInformation) => boolean,
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
		let offset = translateOffset(this.embeddedDocument.offsetAt(position), mapping.generatedOffsets, mapping.sourceOffsets, mapping.generatedLengths ?? mapping.lengths, mapping.lengths);
		if (offset !== undefined) {
			return this.sourceDocument.positionAt(offset);
		}
	}

	protected matchGeneratedPosition(position: vscode.Position, mapping: Mapping) {
		let offset = translateOffset(this.sourceDocument.offsetAt(position), mapping.sourceOffsets, mapping.generatedOffsets, mapping.lengths, mapping.generatedLengths ?? mapping.lengths);
		if (offset !== undefined) {
			return this.embeddedDocument.positionAt(offset);
		}
	}
}

export class LinkedCodeMapWithDocument extends SourceMapWithDocuments {
	constructor(
		public document: TextDocument,
		public linkedMap: LinkedCodeMap,
		public virtualCode: VirtualCode,
	) {
		super(document, document, linkedMap, virtualCode);
	}
	*getLinkedCodePositions(posotion: vscode.Position) {
		for (const linkedPosition of this.linkedMap.getLinkedOffsets(this.document.offsetAt(posotion))) {
			yield this.document.positionAt(linkedPosition);
		}
	}
}
