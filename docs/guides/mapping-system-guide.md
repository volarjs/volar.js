# Mapping System Guide

A comprehensive guide to understanding the mapping system in Volar.js, including `Mapping`, `CodeMapping`, `CodeInformation`, and `Mapper`.

## Table of Contents

- [Introduction](#introduction)
- [Mapping Structure](#mapping-structure)
- [CodeMapping vs Mapping](#codemapping-vs-mapping)
- [CodeInformation Deep Dive](#codeinformation-deep-dive)
- [Creating Mappings](#creating-mappings)
- [Mapper Interface](#mapper-interface)
- [SourceMap Class](#sourcemap-class)
- [Common Patterns](#common-patterns)

## Introduction

The mapping system in Volar.js translates positions between **source code** and **virtual code**. This enables language service features to work on virtual code while displaying results in the original source code.

### Why Mappings?

Mappings enable:
- **Position translation**: Map cursor positions between source and virtual code
- **Feature control**: Control which features are enabled for each code region
- **Diagnostic mapping**: Map errors from virtual code back to source
- **Multi-file support**: Handle mappings across multiple source files

### Key Concepts

- **Source**: Original file content (e.g., `.vue` file)
- **Virtual Code**: Generated code (e.g., TypeScript generated from Vue template)
- **Mapping**: Relationship between source and virtual code positions
- **CodeInformation**: Feature flags for each mapped region

## Mapping Structure

### Mapping Interface

```typescript
interface Mapping<Data = unknown> {
  /** Offsets in the source code */
  sourceOffsets: number[];

  /** Offsets in the generated code */
  generatedOffsets: number[];

  /** Lengths of the mapped regions in source */
  lengths: number[];

  /** Lengths of the mapped regions in generated (optional) */
  generatedLengths?: number[];

  /** Data associated with this mapping */
  data: Data;
}
```

### Understanding Arrays

All offset and length arrays must have the **same length**. Each index represents one mapped region:

```typescript
{
  sourceOffsets: [0, 10, 20],      // 3 regions in source
  generatedOffsets: [0, 15, 30],  // 3 regions in generated
  lengths: [5, 5, 5],             // 3 lengths
  data: { /* ... */ }
}
```

This maps:
- Source `[0-5)` → Generated `[0-5)`
- Source `[10-15)` → Generated `[15-20)`
- Source `[20-25)` → Generated `[30-35)`

### Offset System

Offsets are **zero-based** and use **half-open intervals** `[start, end)`:

```typescript
// Source code: "Hello World"
// Offset 0 = 'H'
// Offset 5 = ' ' (space)
// Offset 11 = end of string

// Mapping "Hello" (offsets 0-5)
{
  sourceOffsets: [0],
  generatedOffsets: [0],
  lengths: [5], // Length is 5, covers [0-5)
  data: { /* ... */ }
}
```

### Lengths

**lengths**: Length in source code (required)
**generatedLengths**: Length in generated code (optional, defaults to `lengths`)

```typescript
// Source: "Hello" (5 chars) → Generated: "Hello World" (11 chars)
{
  sourceOffsets: [0],
  generatedOffsets: [0],
  lengths: [5],              // Source length: 5
  generatedLengths: [11],    // Generated length: 11
  data: { /* ... */ }
}
```

If `generatedLengths` is not provided, it defaults to `lengths` (1:1 mapping).

## CodeMapping vs Mapping

### Mapping<Data>

Generic mapping with custom data type:

```typescript
interface Mapping<Data = unknown> {
  sourceOffsets: number[];
  generatedOffsets: number[];
  lengths: number[];
  generatedLengths?: number[];
  data: Data; // Generic data
}
```

### CodeMapping

`CodeMapping` is `Mapping<CodeInformation>`:

```typescript
type CodeMapping = Mapping<CodeInformation>;
```

Used specifically for mapping between source and virtual code with feature flags.

### When to Use Each

- **Mapping<Data>**: Generic mappings (e.g., `linkedCodeMappings`)
- **CodeMapping**: Source-to-virtual code mappings with feature flags

## CodeInformation Deep Dive

`CodeInformation` controls which language features are enabled for each mapped region.

### Interface

```typescript
interface CodeInformation {
  /** Enable diagnostics and code actions */
  verification?: boolean | {
    shouldReport?(source: string | undefined, code: string | number | undefined): boolean;
  };

  /** Enable code completion */
  completion?: boolean | {
    isAdditional?: boolean;
    onlyImport?: boolean;
  };

  /** Enable semantic features (hover, semantic tokens, etc.) */
  semantic?: boolean | {
    shouldHighlight?(): boolean;
  };

  /** Enable navigation features (go-to-definition, references, rename) */
  navigation?: boolean | {
    shouldHighlight?(): boolean;
    shouldRename?(): boolean;
    resolveRenameNewName?(newName: string): string;
    resolveRenameEditText?(newText: string): string;
  };

  /** Enable structure features (document symbols, folding) */
  structure?: boolean;

  /** Enable formatting */
  format?: boolean;
}
```

### verification

Controls diagnostics and code actions.

**Simple form**:
```typescript
verification: true  // Enable all diagnostics and code actions
verification: false // Disable diagnostics and code actions
```

**Advanced form**:
```typescript
verification: {
  shouldReport(source, code) {
    // Filter specific diagnostics
    if (code === 'TS2304') {
      return false; // Don't report "Cannot find name"
    }
    return true; // Report other diagnostics
  }
}
```

**Features controlled**:
- Diagnostics (errors, warnings)
- Code actions (quick fixes, refactorings)

**Example**:
```typescript
mappings: [
  {
    sourceOffsets: [0],
    generatedOffsets: [0],
    lengths: [100],
    data: {
      verification: true, // Enable diagnostics
    },
  },
]
```

### completion

Controls code completion.

**Simple form**:
```typescript
completion: true  // Enable completion
completion: false // Disable completion
```

**Advanced form**:
```typescript
completion: {
  isAdditional: true,    // Additional completions (merge with others)
  onlyImport: true,      // Only show import completions
}
```

**Features controlled**:
- Code completion
- Auto-insert snippets
- Signature help

**Example**:
```typescript
mappings: [
  {
    sourceOffsets: [0],
    generatedOffsets: [0],
    lengths: [50],
    data: {
      completion: {
        isAdditional: true, // Merge with TypeScript completions
        onlyImport: false,
      },
    },
  },
]
```

### semantic

Controls semantic features.

**Simple form**:
```typescript
semantic: true  // Enable semantic features
semantic: false // Disable semantic features
```

**Advanced form**:
```typescript
semantic: {
  shouldHighlight() {
    // Control highlighting
    return true;
  }
}
```

**Features controlled**:
- Hover information
- Inlay hints
- Code lens
- Semantic tokens
- Moniker
- Inline values

**Example**:
```typescript
mappings: [
  {
    sourceOffsets: [0],
    generatedOffsets: [0],
    lengths: [100],
    data: {
      semantic: true, // Enable hover, semantic tokens, etc.
    },
  },
]
```

### navigation

Controls navigation features.

**Simple form**:
```typescript
navigation: true  // Enable navigation
navigation: false // Disable navigation
```

**Advanced form**:
```typescript
navigation: {
  shouldHighlight() {
    return true; // Enable highlighting
  },
  shouldRename() {
    return true; // Enable rename
  },
  resolveRenameNewName(newName) {
    return newName.toUpperCase(); // Transform rename
  },
  resolveRenameEditText(newText) {
    return newText; // Transform edit text
  },
}
```

**Features controlled**:
- Go to definition
- Go to type definition
- Find references
- Find implementations
- Document highlights
- Rename

**Example**:
```typescript
mappings: [
  {
    sourceOffsets: [0],
    generatedOffsets: [0],
    lengths: [100],
    data: {
      navigation: {
        shouldHighlight: true,
        shouldRename: true,
      },
    },
  },
]
```

### structure

Controls structure features.

**Simple form**:
```typescript
structure: true  // Enable structure features
structure: false // Disable structure features
```

**Features controlled**:
- Document symbols (outline)
- Folding ranges
- Selection ranges
- Linked editing ranges
- Color information
- Document links

**Example**:
```typescript
mappings: [
  {
    sourceOffsets: [0],
    generatedOffsets: [0],
    lengths: [100],
    data: {
      structure: true, // Enable outline, folding, etc.
    },
  },
]
```

### format

Controls formatting.

**Simple form**:
```typescript
format: true  // Enable formatting
format: false // Disable formatting
```

**Features controlled**:
- Document formatting
- Range formatting

**Example**:
```typescript
mappings: [
  {
    sourceOffsets: [0],
    generatedOffsets: [0],
    lengths: [100],
    data: {
      format: true, // Enable formatting
    },
  },
]
```

### Complete Example

```typescript
const mappings: CodeMapping[] = [
  // Region 1: Full features
  {
    sourceOffsets: [0],
    generatedOffsets: [0],
    lengths: [100],
    data: {
      verification: true,   // Diagnostics and code actions
      completion: true,      // Code completion
      semantic: true,        // Hover, semantic tokens
      navigation: true,      // Go-to-definition, references
      structure: true,       // Outline, folding
      format: true,         // Formatting
    },
  },
  // Region 2: Read-only (no editing features)
  {
    sourceOffsets: [100],
    generatedOffsets: [100],
    lengths: [50],
    data: {
      verification: false,  // No diagnostics
      completion: false,    // No completion
      semantic: true,       // Hover enabled
      navigation: true,     // Navigation enabled
      structure: true,      // Structure enabled
      format: false,        // No formatting
    },
  },
];
```

## Creating Mappings

### Simple 1:1 Mapping

```typescript
function createSimpleMapping(
  sourceCode: string,
  generatedCode: string
): CodeMapping[] {
  return [
    {
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [sourceCode.length],
      data: {
        verification: true,
        navigation: true,
        completion: true,
        semantic: true,
        structure: true,
        format: true,
      },
    },
  ];
}
```

### Multiple Regions

```typescript
function createMultipleMappings(
  sourceCode: string,
  generatedCode: string
): CodeMapping[] {
  const mappings: CodeMapping[] = [];

  // Find regions in source code
  const regions = findRegions(sourceCode);

  for (const region of regions) {
    // Map each region
    const generatedRegion = mapToGenerated(region, generatedCode);

    mappings.push({
      sourceOffsets: [region.start],
      generatedOffsets: [generatedRegion.start],
      lengths: [region.length],
      generatedLengths: [generatedRegion.length],
      data: {
        verification: region.enableVerification,
        navigation: region.enableNavigation,
        completion: region.enableCompletion,
        semantic: region.enableSemantic,
        structure: region.enableStructure,
        format: region.enableFormat,
      },
    });
  }

  return mappings;
}
```

### Complex Transformation

```typescript
function createComplexMappings(
  sourceCode: string,
  generatedCode: string
): CodeMapping[] {
  const mappings: CodeMapping[] = [];
  let sourceOffset = 0;
  let generatedOffset = 0;

  // Parse source and generate mappings
  const tokens = tokenize(sourceCode);
  
  for (const token of tokens) {
    const generatedToken = transformToken(token);
    
    mappings.push({
      sourceOffsets: [sourceOffset],
      generatedOffsets: [generatedOffset],
      lengths: [token.length],
      generatedLengths: [generatedToken.length],
      data: {
        verification: token.type !== 'comment',
        navigation: token.type === 'identifier',
        completion: token.type === 'identifier',
        semantic: true,
        structure: token.type !== 'whitespace',
        format: token.type !== 'comment',
      },
    });

    sourceOffset += token.length;
    generatedOffset += generatedToken.length;
  }

  return mappings;
}
```

## Mapper Interface

`Mapper` provides methods to translate positions between source and virtual code.

### Interface

```typescript
interface Mapper {
  /** Array of mappings */
  mappings: Mapping<CodeInformation>[];

  /** Map range from generated to source */
  toSourceRange(
    start: number,
    end: number,
    fallbackToAnyMatch: boolean,
    filter?: (data: CodeInformation) => boolean
  ): Generator<readonly [number, number, Mapping<CodeInformation>, Mapping<CodeInformation>]>;

  /** Map range from source to generated */
  toGeneratedRange(
    start: number,
    end: number,
    fallbackToAnyMatch: boolean,
    filter?: (data: CodeInformation) => boolean
  ): Generator<readonly [number, number, Mapping<CodeInformation>, Mapping<CodeInformation>]>;

  /** Map offset from generated to source */
  toSourceLocation(
    generatedOffset: number,
    filter?: (data: CodeInformation) => boolean
  ): Generator<readonly [number, Mapping<CodeInformation>]>;

  /** Map offset from source to generated */
  toGeneratedLocation(
    sourceOffset: number,
    filter?: (data: CodeInformation) => boolean
  ): Generator<readonly [number, Mapping<CodeInformation>]>;
}
```

### Getting a Mapper

```typescript
const sourceScript = language.scripts.get(uri);
if (sourceScript?.generated) {
  const virtualCode = sourceScript.generated.root;
  
  // Get mapper
  const mapper = language.maps.get(virtualCode, sourceScript);
}
```

### Mapping Offsets

**Source to Generated**:
```typescript
const sourceOffset = 50;

for (const [generatedOffset, mapping] of mapper.toGeneratedLocation(sourceOffset)) {
  console.log(`Source ${sourceOffset} → Generated ${generatedOffset}`);
  
  // Filter by CodeInformation
  if (mapping.data.verification) {
    // This mapping has verification enabled
  }
}
```

**Generated to Source**:
```typescript
const generatedOffset = 100;

for (const [sourceOffset, mapping] of mapper.toSourceLocation(generatedOffset)) {
  console.log(`Generated ${generatedOffset} → Source ${sourceOffset}`);
}
```

### Mapping Ranges

**Source to Generated**:
```typescript
const sourceStart = 10;
const sourceEnd = 20;

// Strict matching (start and end must map to same region)
for (const [genStart, genEnd, startMapping, endMapping] of mapper.toGeneratedRange(
  sourceStart,
  sourceEnd,
  false // fallbackToAnyMatch = false
)) {
  console.log(`Source [${sourceStart}-${sourceEnd}) → Generated [${genStart}-${genEnd})`);
}

// Flexible matching (start and end can come from different mappings)
for (const [genStart, genEnd, startMapping, endMapping] of mapper.toGeneratedRange(
  sourceStart,
  sourceEnd,
  true // fallbackToAnyMatch = true
)) {
  console.log(`Source [${sourceStart}-${sourceEnd}) → Generated [${genStart}-${genEnd})`);
}
```

**Generated to Source**:
```typescript
const generatedStart = 50;
const generatedEnd = 60;

for (const [sourceStart, sourceEnd, startMapping, endMapping] of mapper.toSourceRange(
  generatedStart,
  generatedEnd,
  false
)) {
  console.log(`Generated [${generatedStart}-${generatedEnd}) → Source [${sourceStart}-${sourceEnd})`);
}
```

### Filtering by CodeInformation

```typescript
// Only map regions with verification enabled
for (const [generatedOffset, mapping] of mapper.toGeneratedLocation(
  sourceOffset,
  (data) => data.verification === true
)) {
  // Process verified regions
}

// Only map regions with navigation enabled
for (const [sourceOffset, mapping] of mapper.toSourceLocation(
  generatedOffset,
  (data) => data.navigation === true
)) {
  // Process navigable regions
}

// Complex filter
for (const [generatedOffset, mapping] of mapper.toGeneratedLocation(
  sourceOffset,
  (data) => data.verification === true && data.navigation === true
)) {
  // Process regions with both features
}
```

## SourceMap Class

`SourceMap` is the default implementation of `Mapper` used by Volar.js.

### Creating a SourceMap

```typescript
import { SourceMap } from '@volar/source-map';

const mappings: CodeMapping[] = [
  // ... mappings
];

const sourceMap = new SourceMap(mappings);
```

### Methods

All methods from `Mapper` interface are available:

- `toSourceRange()`: Map range from generated to source
- `toGeneratedRange()`: Map range from source to generated
- `toSourceLocation()`: Map offset from generated to source
- `toGeneratedLocation()`: Map offset from source to generated

### Performance

`SourceMap` uses binary search for efficient lookups:
- First lookup: O(n log n) - builds memo
- Subsequent lookups: O(log n) - uses memo

Mappings are automatically memoized for performance.

## Common Patterns

### Pattern 1: Simple 1:1 Mapping

```typescript
const mappings: CodeMapping[] = [
  {
    sourceOffsets: [0],
    generatedOffsets: [0],
    lengths: [sourceCode.length],
    data: {
      verification: true,
      navigation: true,
      completion: true,
      semantic: true,
      structure: true,
      format: true,
    },
  },
];
```

### Pattern 2: Selective Feature Regions

```typescript
const mappings: CodeMapping[] = [
  // Code region: Full features
  {
    sourceOffsets: [0],
    generatedOffsets: [0],
    lengths: [100],
    data: {
      verification: true,
      navigation: true,
      completion: true,
      semantic: true,
      structure: true,
      format: true,
    },
  },
  // Comment region: Read-only
  {
    sourceOffsets: [100],
    generatedOffsets: [100],
    lengths: [50],
    data: {
      verification: false,
      navigation: false,
      completion: false,
      semantic: true,  // Hover enabled
      structure: true,  // Outline enabled
      format: false,
    },
  },
];
```

### Pattern 3: Multiple Mapped Regions

```typescript
const mappings: CodeMapping[] = [
  {
    sourceOffsets: [0, 10, 20],
    generatedOffsets: [0, 15, 30],
    lengths: [5, 5, 5],
    data: {
      verification: true,
      navigation: true,
    },
  },
];
```

### Pattern 4: Filtered Mapping

```typescript
// Map position, but only if verification is enabled
const mapper = language.maps.get(virtualCode, sourceScript);

for (const [generatedOffset, mapping] of mapper.toGeneratedLocation(
  sourceOffset,
  (data) => data.verification === true
)) {
  // Only process if verification is enabled
  processDiagnostics(generatedOffset);
}
```

## Related Documentation

- [VirtualCode Complete Reference](./virtualcode-complete-reference.md) - VirtualCode structure
- [Language Plugin Complete Guide](./language-plugin-complete-guide.md) - Creating plugins
- [Script Snapshot Guide](./script-snapshot-guide.md) - Working with snapshots
- [Integration Guide](./integration-guide.md) - How mappings are used

