import { binarySearch } from './binarySearch';

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

/** A segment of a `SpanMap`, its omitted `features` as `SpanMapFeature.All`. */
export type NormalizedSpanMapSegment = SpanMapSegment & { readonly features: SpanMapFeature };

export interface MappedPosition {
	readonly position: number;
	readonly fidelity: SpanMapFidelity;
	readonly segment: NormalizedSpanMapSegment;
}

export interface MappedRange {
	readonly start: number;
	readonly end: number;
	/** `Approximate` if `start` and `end` map through different segments. */
	readonly fidelity: SpanMapFidelity;
	readonly segments: readonly [start: NormalizedSpanMapSegment, end: NormalizedSpanMapSegment];
}

type Side = 'virtual' | 'original';

interface SideIndex {
	offsets: number[];
	segments: Set<NormalizedSpanMapSegment>[];
}

/**
 * Maps positions and ranges between virtual and original text, every candidate of each. A position maps through
 * every segment that contains it, its end included; a range maps through one segment that contains it or, if none
 * does, from a segment of its start to a segment of its end, as `Approximate`. Text outside every segment maps to
 * nothing. `feature` selects the segments that share one of its bits; all segments if omitted.
 */
export class SpanMap {
	readonly segments: readonly NormalizedSpanMapSegment[];
	private virtualIndex: SideIndex | undefined;
	private originalIndex: SideIndex | undefined;

	constructor(segments: readonly SpanMapSegment[]) {
		this.segments = segments.map(segment => ({ ...segment, features: segment.features ?? SpanMapFeature.All }));
	}

	virtualToOriginalPositions(position: number, feature?: SpanMapFeature): MappedPosition[] {
		return this.mapPosition(position, 'virtual', feature, false);
	}

	originalToVirtualPositions(position: number, feature?: SpanMapFeature): MappedPosition[] {
		return this.mapPosition(position, 'original', feature, false);
	}

	virtualToOriginalSpans(start: number, end: number, feature?: SpanMapFeature): MappedRange[] {
		return this.mapRange(start, end, 'virtual', feature);
	}

	originalToVirtualSpans(start: number, end: number, feature?: SpanMapFeature): MappedRange[] {
		return this.mapRange(start, end, 'original', feature);
	}

	private mapPosition(position: number, from: Side, feature: SpanMapFeature | undefined, preferEnd: boolean) {
		const index = this.getIndex(from);
		const results: MappedPosition[] = [];
		if (!index.offsets.length) {
			return results;
		}
		const { low, high } = binarySearch(index.offsets, position);
		const visited = new Set<NormalizedSpanMapSegment>();
		for (let i = low; i <= high; i++) {
			for (const segment of index.segments[i]!) {
				if (visited.has(segment)) {
					continue;
				}
				visited.add(segment);
				if (feature !== undefined && !(segment.features & feature)) {
					continue;
				}
				const mapped = translate(position, segment, from, preferEnd);
				if (mapped !== undefined) {
					results.push({
						position: mapped,
						fidelity: segment.kind === SpanMapKind.Verbatim ? SpanMapFidelity.Exact : SpanMapFidelity.Atom,
						segment,
					});
				}
			}
		}
		return results;
	}

	private mapRange(start: number, end: number, from: Side, feature: SpanMapFeature | undefined) {
		const starts = this.mapPosition(start, from, feature, false);
		const results: MappedRange[] = [];
		for (const { position, fidelity, segment } of starts) {
			const mappedEnd = translate(end, segment, from, true);
			if (mappedEnd !== undefined) {
				results.push({ start: position, end: mappedEnd, fidelity, segments: [segment, segment] });
			}
		}
		if (results.length) {
			return results;
		}
		const ends = this.mapPosition(end, from, feature, true);
		for (const mappedStart of starts) {
			const mappedEnd = ends.find(mappedEnd => mappedEnd.position >= mappedStart.position);
			if (mappedEnd) {
				results.push({
					start: mappedStart.position,
					end: mappedEnd.position,
					fidelity: SpanMapFidelity.Approximate,
					segments: [mappedStart.segment, mappedEnd.segment],
				});
			}
		}
		return results;
	}

	private getIndex(side: Side) {
		return side === 'virtual'
			? this.virtualIndex ??= createIndex(this.segments, 'virtual')
			: this.originalIndex ??= createIndex(this.segments, 'original');
	}
}

function createIndex(segments: readonly NormalizedSpanMapSegment[], side: Side): SideIndex {
	const offsetSet = new Set<number>();
	for (const segment of segments) {
		const [start, end] = rangeOf(segment, side);
		offsetSet.add(start);
		offsetSet.add(end);
	}
	const offsets = [...offsetSet].sort((a, b) => a - b);
	const buckets = offsets.map(() => new Set<NormalizedSpanMapSegment>());
	for (const segment of segments) {
		const [start, end] = rangeOf(segment, side);
		const startIndex = binarySearch(offsets, start).match!;
		const endIndex = binarySearch(offsets, end).match!;
		for (let i = startIndex; i <= endIndex; i++) {
			buckets[i]!.add(segment);
		}
	}
	return { offsets, segments: buckets };
}

function rangeOf(segment: SpanMapSegment, side: Side): [start: number, end: number] {
	return side === 'virtual'
		? [segment.virtualStart, segment.virtualEnd]
		: [segment.originalStart, segment.originalEnd];
}

function translate(position: number, segment: SpanMapSegment, from: Side, preferEnd: boolean) {
	const [fromStart, fromEnd] = rangeOf(segment, from);
	const [toStart, toEnd] = rangeOf(segment, from === 'virtual' ? 'original' : 'virtual');
	const relative = position - fromStart;
	if (relative < 0 || position > fromEnd) {
		return;
	}
	if (segment.kind === SpanMapKind.Verbatim) {
		return Math.min(toStart + relative, toEnd);
	}
	// an atom, or an alias, maps as a whole: its edges to the edges, its inside to the start or, for an end, the end
	if (relative === 0 && (fromEnd > fromStart || !preferEnd)) {
		return toStart;
	}
	if (position === fromEnd || preferEnd) {
		return toEnd;
	}
	return toStart;
}
