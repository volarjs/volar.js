export enum SpanMapKind {
	Verbatim = 0,
	Atom = 1,
	Alias = 2,
}

export enum SpanMapFeature {
	Hover = 1 << 0,
	SignatureHelp = 1 << 1,
	Completion = 1 << 2,
	Definition = 1 << 3,
	TypeDefinition = 1 << 4,
	Implementation = 1 << 5,
	References = 1 << 6,
	DocumentHighlights = 1 << 7,
	Rename = 1 << 8,
	CallHierarchy = 1 << 9,
	CodeActions = 1 << 10,
	Formatting = 1 << 11,
	InlayHints = 1 << 12,
	SemanticTokens = 1 << 13,
	FoldingRanges = 1 << 14,
	SelectionRanges = 1 << 15,
	LinkedEditing = 1 << 16,
	AutoInsert = 1 << 17,
	DocumentSymbols = 1 << 18,
	CodeLens = 1 << 19,
	None = 0,
	All = (1 << 20) - 1,
}

export enum SpanMapFidelity {
	Exact = 0,
	Atom = 1,
	Approximate = 2,
	None = 3,
}

/** A half-open virtual range mapped to a half-open original range, as `SpanMapSegment` of TS 7.1. */
export interface SpanMapSegment {
	readonly virtualStart: number;
	readonly virtualEnd: number;
	readonly originalStart: number;
	readonly originalEnd: number;
	readonly kind: SpanMapKind;
	/** `SpanMapFeature.All` if omitted. */
	readonly features?: SpanMapFeature;
}

export type Mapping = [
	generatedStart: number,
	generatedLength: number,
	sourceStart: number,
	sourceLength: number,
	kind: SpanMapKind,
	features: number,
];
