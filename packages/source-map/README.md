# @volar/source-map

Provides functionality related to source maps.

## API

### This package exports a `SourceMap` class with the following methods:

Params:

- `fallbackToAnyMatch`(default: false): allow the start and end offsets to come from different mappings.
- `filter?: (data: Data) => boolean)`(default: undefined): according to mapping: Mapping<MyDataType>.data, filter out offsets that do not meet the custom conditions.

Methods:

- `toSourceRange(generatedStart: number, generatedEnd: number, fallbackToAnyMatch: boolean, filter?: (data: Data) => boolean)`: Returns all source start and end offsets for the given generated start and end offsets.

- `toGeneratedRange(sourceStart: number, sourceEnd: number, fallbackToAnyMatch: boolean, filter?: (data: Data) => boolean) `: Returns all generated start and end offsets for the given source start and end offsets.

- `toSourceLocation(generatedOffset: number, filter?: (data: Data) => boolean)`: Returns all source offsets for a given generated offset.

- `toGeneratedLocation(sourceOffset: number, filter?: (data: Data) => boolean)`: Returns all generated offsets for a given source offset.

## Data Structures

### `Mapping`

The `Mapping` is a tuple that represents a mapping in the source map. It consists of the following elements:

- `source`: A string representing the source file. This can be `undefined`.
- `sourceOffsets`: Offsets in the source code.
- `generatedOffsets`: Offsets in the generated code.
- `data`: The data associated with this mapping. The type of this data is generic and can be specified when creating a `SourceMap` instance.

Here is an example of a `Mapping`:

```ts
let mapping: Mapping<MyDataType> = {
  source: ".../sourceFile.ts",
  sourceOffsets: [10],
  generatedOffsets: [30],
  lengths: [10],
  data: myData,
};
```

In this example, `myData` is of type `MyDataType`, which is the type specified for the SourceMap instance.

Remember to replace `MyDataType` and `myData` with actual types and data that are relevant to your project.

## Use Cases

### 1. Mapping Diagnostics

Map diagnostics from generated code back to source:

```typescript
import { SourceMap } from "@volar/source-map";

const sourceMap = new SourceMap(mappings);
const diagnostic = { range: { start: 100, end: 110 } };

// Map diagnostic range from generated to source
for (const [sourceStart, sourceEnd] of sourceMap.toSourceRange(
  diagnostic.range.start,
  diagnostic.range.end,
  false,
  (data) => data.verification === true // Only map verification-enabled regions
)) {
  console.log(`Source range: ${sourceStart} - ${sourceEnd}`);
}
```

### 2. Mapping Hover Positions

Map hover positions from source to generated code:

```typescript
const sourcePosition = 50;

// Map to generated position
for (const [generatedOffset, mapping] of sourceMap.toGeneratedLocation(
  sourcePosition,
  (data) => data.semantic === true // Only map semantic regions
)) {
  // Use generatedOffset for hover lookup
  const hoverInfo = getHoverInfo(generatedOffset);
}
```

### 3. Mapping Completion Ranges

Map completion insert ranges:

```typescript
const completionRange = { start: 200, end: 210 };

// Map completion range
for (const [sourceStart, sourceEnd] of sourceMap.toSourceRange(
  completionRange.start,
  completionRange.end,
  false,
  (data) => data.completion === true
)) {
  // Use source range for completion
}
```

## Performance Considerations

### Binary Search Optimization

The `SourceMap` class uses binary search for efficient offset lookup. Mappings are memoized for performance:

- **First lookup**: O(n log n) - builds memo
- **Subsequent lookups**: O(log n) - uses memo

### Memoization

Mappings are automatically memoized:

```typescript
const sourceMap = new SourceMap(mappings);

// First call builds memo
sourceMap.toSourceLocation(100); // O(n log n)

// Subsequent calls use memo
sourceMap.toSourceLocation(200); // O(log n)
sourceMap.toSourceLocation(300); // O(log n)
```

### Large Mapping Sets

For large numbers of mappings:

1. **Filter early**: Use filter functions to reduce mapping set
2. **Cache results**: Cache frequently accessed mappings
3. **Batch operations**: Process multiple offsets together

## Advanced Scenarios

### Multiple Source Files

Handle mappings from multiple source files:

```typescript
const mappings: Mapping[] = [
  {
    source: "file1.ts",
    sourceOffsets: [0],
    generatedOffsets: [0],
    lengths: [100],
    data: { verification: true },
  },
  {
    source: "file2.ts",
    sourceOffsets: [0],
    generatedOffsets: [100],
    lengths: [50],
    data: { verification: true },
  },
];

const sourceMap = new SourceMap(mappings);

// Map to specific source file
for (const [sourceOffset, mapping] of sourceMap.toSourceLocation(150)) {
  if (mapping.source === "file2.ts") {
    // Handle file2.ts mapping
  }
}
```

### Overlapping Mappings

Handle overlapping mappings with `fallbackToAnyMatch`:

```typescript
// Without fallback (strict matching)
for (const [start, end] of sourceMap.toSourceRange(100, 200, false)) {
  // Both start and end must map to same source range
}

// With fallback (flexible matching)
for (const [start, end] of sourceMap.toSourceRange(100, 200, true)) {
  // Start and end can come from different mappings
}
```

### Filtering by Code Information

Filter mappings based on code information:

```typescript
// Only map verification-enabled regions
const verificationMappings = sourceMap.toSourceLocation(
  offset,
  (data) => data.verification === true
);

// Only map navigation-enabled regions
const navigationMappings = sourceMap.toSourceLocation(
  offset,
  (data) => data.navigation === true
);

// Complex filter
const complexMappings = sourceMap.toSourceLocation(
  offset,
  (data) => data.verification === true && data.navigation === true
);
```

## Common Patterns

### Pattern: Map Diagnostic

```typescript
function mapDiagnostic(
  sourceMap: SourceMap<CodeInformation>,
  diagnostic: Diagnostic
): Diagnostic | undefined {
  for (const [sourceStart, sourceEnd] of sourceMap.toSourceRange(
    diagnostic.range.start,
    diagnostic.range.end,
    false,
    (data) => data.verification === true
  )) {
    return {
      ...diagnostic,
      range: {
        start: sourceStart,
        end: sourceEnd,
      },
    };
  }
}
```

### Pattern: Map Position

```typescript
function mapPosition(
  sourceMap: SourceMap<CodeInformation>,
  position: number,
  filter: (data: CodeInformation) => boolean
): number | undefined {
  for (const [mapped] of sourceMap.toSourceLocation(position, filter)) {
    return mapped;
  }
}
```

### Pattern: Map Range with Fallback

```typescript
function mapRange(
  sourceMap: SourceMap<CodeInformation>,
  start: number,
  end: number,
  filter: (data: CodeInformation) => boolean
): { start: number; end: number } | undefined {
  // Try strict matching first
  for (const [mappedStart, mappedEnd] of sourceMap.toSourceRange(
    start,
    end,
    false,
    filter
  )) {
    return { start: mappedStart, end: mappedEnd };
  }

  // Fall back to flexible matching
  for (const [mappedStart, mappedEnd] of sourceMap.toSourceRange(
    start,
    end,
    true,
    filter
  )) {
    return { start: mappedStart, end: mappedEnd };
  }
}
```

## Related Documentation

- [Architecture Guide](../../docs/ARCHITECTURE.md) - System architecture
- [Data Flow](../../docs/DATA_FLOW.md) - How mappings are used
- [@volar/language-core](../language-core/README.md) - Core language processing

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.
