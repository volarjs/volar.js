# @volar/source-map

Maps positions and ranges between virtual (generated) and original (source) text, in the span map model of
TypeScript 7.1: `SpanMapSegment`, `SpanMapKind`, `SpanMapFeature` and `SpanMapFidelity` have the shape and values
of their counterparts in `typescript/ast`.

## `SpanMapSegment`

```ts
interface SpanMapSegment {
	virtualStart: number;
	virtualEnd: number;
	originalStart: number;
	originalEnd: number;
	kind: SpanMapKind;
	features?: SpanMapFeature; // SpanMapFeature.All if omitted
}
```

Ranges are half-open (`[start, end)`).

- `SpanMapKind.Verbatim`: offsets inside the spans map 1:1, clamped to the other span.
- `SpanMapKind.Atom`: the spans map as a whole. An edge maps to the edge; an offset inside maps to the start, or to
  the end for the end of a range; a range inside one maps to the whole other span.
- `SpanMapKind.Alias`: maps as `Atom`. It exists for parity with TS.
- `features`: the `SpanMapFeature` bits of the language features that the segment takes part in.

```ts
const segment: SpanMapSegment = {
	virtualStart: 30,
	virtualEnd: 40,
	originalStart: 10,
	originalEnd: 20,
	kind: SpanMapKind.Verbatim,
	features: SpanMapFeature.Hover | SpanMapFeature.Completion,
};
```

## `SpanMap`

```ts
const map = new SpanMap(segments);
map.virtualToOriginalPositions(position, feature?): MappedPosition[];
map.originalToVirtualPositions(position, feature?): MappedPosition[];
map.virtualToOriginalSpans(start, end, feature?): MappedRange[];
map.originalToVirtualSpans(start, end, feature?): MappedRange[];
```

- Every method returns every candidate, in segment order. Text outside every segment maps to nothing.
- A position maps through each segment that contains it, its end included.
- A range maps through each segment that contains it, with the fidelity `Exact` (verbatim) or `Atom`. If no segment
  contains it, it maps from a segment of its start to the nearest segment of its end, with the fidelity
  `Approximate`; callers that edit text (rename) reject `Approximate`.
- `feature` selects the segments that share one of its bits; every segment if it is omitted.
- `map.segments` are the segments with omitted `features` as `SpanMapFeature.All`.

Unlike `SpanMap` of TS, `virtualToOriginal*` return every candidate rather than one, and a gap maps to nothing
rather than to an insertion point.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.
