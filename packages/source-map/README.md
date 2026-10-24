# @volar/source-map

Provides functionality related to source maps.

## API

### This package exports a `SourceMap` class with the following methods:

Params:

- `fallbackToAnyMatch`(default: false): allow the start and end offsets to come from different mappings.
- `filter?: (features: number) => boolean`(default: undefined): filter out mappings by their `SpanMapFeature` bits.

Methods:

- `toSourceRange(generatedStart: number, generatedEnd: number, fallbackToAnyMatch: boolean, filter?: (features: number) => boolean)`: Returns all source start and end offsets for the given generated start and end offsets.

- `toGeneratedRange(sourceStart: number, sourceEnd: number, fallbackToAnyMatch: boolean, filter?: (features: number) => boolean)`: Returns all generated start and end offsets for the given source start and end offsets.

- `toSourceLocation(generatedOffset: number, filter?: (features: number) => boolean)`: Returns all source offsets for a given generated offset.

- `toGeneratedLocation(sourceOffset: number, filter?: (features: number) => boolean)`: Returns all generated offsets for a given source offset.

## Data Structures

### `Mapping`

A `Mapping` uses the span mapping format of TypeScript 7 content mappers:

```ts
type Mapping = [
	generatedStart: number,
	generatedLength: number,
	sourceStart: number,
	sourceLength: number,
	kind: SpanMapKind,
	features: number,
];
```

- `SpanMapKind.Verbatim`: both spans have the same length and offsets inside them map 1:1.
- `SpanMapKind.Atom` / `SpanMapKind.Alias`: the spans map as a whole; offsets inside them clamp to the edges, and a range inside one maps to the whole other span.
- `features`: `SpanMapFeature` bit flags selecting the language features the mapping takes part in. `SpanMapFeature.Verification` is a Volar extension that enables diagnostics.

```ts
const mapping: Mapping = [30, 10, 10, 10, SpanMapKind.Verbatim, SpanMapFeature.Hover | SpanMapFeature.Completion];
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.
