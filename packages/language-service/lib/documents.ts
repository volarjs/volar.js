import { CodeInformation, LinkedCodeMap, SourceMap, VirtualCode } from '@volar/language-core';
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
		for (const [mappedStart, mappedEnd] of this.map.getSourceStartEnd(
			this.embeddedDocument.offsetAt(range.start),
			this.embeddedDocument.offsetAt(range.end),
			true,
			filter
		)) {
			yield { start: this.sourceDocument.positionAt(mappedStart), end: this.sourceDocument.positionAt(mappedEnd) };
		}
	}

	public * getGeneratedRanges(range: vscode.Range, filter: (data: CodeInformation) => boolean = () => true) {
		for (const [mappedStart, mappedEnd] of this.map.getGeneratedStartEnd(
			this.sourceDocument.offsetAt(range.start),
			this.sourceDocument.offsetAt(range.end),
			true,
			filter
		)) {
			yield { start: this.embeddedDocument.positionAt(mappedStart), end: this.embeddedDocument.positionAt(mappedEnd) };
		}
	}

	public * getSourcePositions(position: vscode.Position, filter: (data: CodeInformation) => boolean = () => true) {
		for (const mapped of this.map.getSourceOffsets(this.embeddedDocument.offsetAt(position), filter)) {
			yield this.sourceDocument.positionAt(mapped[0]);
		}
	}

	public * getGeneratedPositions(position: vscode.Position, filter: (data: CodeInformation) => boolean = () => true) {
		for (const mapped of this.map.getGeneratedOffsets(this.sourceDocument.offsetAt(position), filter)) {
			yield this.embeddedDocument.positionAt(mapped[0]);
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
