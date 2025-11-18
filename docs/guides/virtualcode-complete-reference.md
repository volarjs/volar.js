# VirtualCode Complete Reference

A comprehensive guide to understanding and working with `VirtualCode` in Volar.js.

## Table of Contents

- [Introduction](#introduction)
- [VirtualCode Interface](#virtualcode-interface)
- [Properties Deep Dive](#properties-deep-dive)
- [Creating VirtualCode](#creating-virtualcode)
- [Using VirtualCode](#using-virtualcode)
- [Updating VirtualCode](#updating-virtualcode)
- [VirtualCode Lifecycle](#virtualcode-lifecycle)
- [How VirtualCode Flows Through the System](#how-virtualcode-flows-through-the-system)
- [Common Patterns](#common-patterns)

## Introduction

`VirtualCode` is the core abstraction in Volar.js. It represents **generated code** that is derived from a source file. Virtual code is typically TypeScript code that can be processed by language service features like type checking, IntelliSense, and diagnostics.

### What is VirtualCode?

VirtualCode is:
- **Generated code**: Code created from source files (e.g., TypeScript generated from Vue templates)
- **Mapped to source**: Every position in virtual code maps back to source positions
- **Processable**: Can be analyzed by TypeScript and other language services
- **Feature-controlled**: Each region has flags controlling which features are enabled

### Why VirtualCode?

VirtualCode enables:
- **Type checking**: Transform any language to TypeScript for type checking
- **IntelliSense**: Provide IDE features for languages without native support
- **Multi-language files**: Handle files with embedded languages (Vue, Svelte)
- **Position mapping**: Map IDE features back to original source positions

## VirtualCode Interface

The complete `VirtualCode` interface:

```typescript
interface VirtualCode {
  /** Unique identifier for this virtual code */
  id: string;

  /** Language ID of the generated code (e.g., "typescript", "javascript") */
  languageId: string;

  /** Immutable snapshot of the generated code content */
  snapshot: IScriptSnapshot;

  /** Mappings from source code to this virtual code */
  mappings: CodeMapping[];

  /** Mappings to associated source scripts (for multi-file scenarios) */
  associatedScriptMappings?: Map<unknown, CodeMapping[]>;

  /** Nested virtual codes (e.g., embedded CSS in a Vue file) */
  embeddedCodes?: VirtualCode[];

  /** Linked code mappings for synchronized editing */
  linkedCodeMappings?: Mapping[];
}
```

## Properties Deep Dive

### id: string

**Purpose**: Unique identifier for the virtual code within a source file.

**Naming Conventions**:
- `"main"` or `"root"`: Primary virtual code
- `"script"`: Script section (Vue, Svelte)
- `"template"`: Template section
- `"style"`: Style section
- `"setup"`: Setup script (Vue 3)
- Custom names: Use descriptive names for your use case

**Example**:

```typescript
// Single virtual code
{
  id: 'main',
  // ...
}

// Multiple embedded codes
{
  id: 'root',
  embeddedCodes: [
    { id: 'script', /* ... */ },
    { id: 'template', /* ... */ },
    { id: 'style', /* ... */ },
  ],
}
```

**Best Practices**:
- Use consistent naming conventions
- Make IDs descriptive
- Keep IDs unique within a source file

### languageId: string

**Purpose**: Specifies the language of the generated code.

**Common Values**:
- `"typescript"`: TypeScript code (most common)
- `"javascript"`: JavaScript code
- `"html"`: HTML code (for templates)
- `"css"`: CSS code (for styles)
- `"json"`: JSON code

**Example**:

```typescript
// TypeScript virtual code
{
  id: 'main',
  languageId: 'typescript',
  // ...
}

// HTML template virtual code
{
  id: 'template',
  languageId: 'html',
  // ...
}
```

**Important**: The `languageId` determines which language service will process the virtual code. Use `"typescript"` for code that needs type checking and IntelliSense.

### snapshot: IScriptSnapshot

**Purpose**: Immutable snapshot of the generated code content.

**Interface**:

```typescript
interface IScriptSnapshot {
  /** Gets a portion of the script snapshot specified by [start, end) */
  getText(start: number, end: number): string;

  /** Gets the length of this script snapshot */
  getLength(): number;

  /**
   * Gets the TextChangeRange that describes how the text changed.
   * Used for incremental updates.
   */
  getChangeRange(oldSnapshot: IScriptSnapshot): TextChangeRange | undefined;

  /** Releases all resources held by this script snapshot */
  dispose?(): void;
}
```

**Creating a Snapshot**:

```typescript
const generatedCode = 'export function main() { return 42; }';

const snapshot: IScriptSnapshot = {
  getText: (start, end) => generatedCode.substring(start, end),
  getLength: () => generatedCode.length,
  getChangeRange: (oldSnapshot) => {
    // Calculate change range for incremental updates
    // Return undefined if not available
    return undefined;
  },
  dispose: () => {
    // Clean up resources if needed
  },
};
```

**Key Points**:
- Snapshot is **immutable** - don't modify it after creation
- `getText` uses half-open interval `[start, end)`
- `getChangeRange` enables incremental updates
- Implement `dispose` if snapshot holds resources

**See Also**: [Script Snapshot Guide](./script-snapshot-guide.md) for detailed information.

### mappings: CodeMapping[]

**Purpose**: Maps positions between source code and virtual code.

**Type**: `CodeMapping[]` where `CodeMapping = Mapping<CodeInformation>`

**Mapping Structure**:

```typescript
interface Mapping<Data> {
  /** Offsets in the source code */
  sourceOffsets: number[];

  /** Offsets in the generated code */
  generatedOffsets: number[];

  /** Lengths of the mapped regions in source */
  lengths: number[];

  /** Lengths of the mapped regions in generated (optional) */
  generatedLengths?: number[];

  /** Code information controlling features */
  data: Data; // CodeInformation for CodeMapping
}
```

**Example**:

```typescript
mappings: [
  {
    sourceOffsets: [0, 10, 20],
    generatedOffsets: [0, 15, 30],
    lengths: [5, 5, 5],
    data: {
      verification: true,
      navigation: true,
      completion: true,
    },
  },
]
```

**Mapping Rules**:
- Arrays must have the same length
- Each index represents one mapped region
- `sourceOffsets[i]` maps to `generatedOffsets[i]`
- `lengths[i]` is the length in source
- `generatedLengths[i]` (if provided) is the length in generated

**See Also**: [Mapping System Guide](./mapping-system-guide.md) for detailed information.

### associatedScriptMappings?: Map<unknown, CodeMapping[]>

**Purpose**: Maps virtual code to multiple source scripts (multi-file scenarios).

**When to Use**:
- Virtual code generated from multiple source files
- Files that reference other files
- Multi-file language plugins

**Example**:

```typescript
// Virtual code that combines multiple files
const virtualCode: VirtualCode = {
  id: 'main',
  languageId: 'typescript',
  snapshot: combinedSnapshot,
  mappings: [
    // Mappings to primary source
    {
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [100],
      data: { verification: true },
    },
  ],
  associatedScriptMappings: new Map([
    // Mappings to associated file 1
    [associatedFile1Id, [
      {
        sourceOffsets: [0],
        generatedOffsets: [100],
        lengths: [50],
        data: { verification: true },
      },
    ]],
    // Mappings to associated file 2
    [associatedFile2Id, [
      {
        sourceOffsets: [0],
        generatedOffsets: [150],
        lengths: [30],
        data: { verification: true },
      },
    ]],
  ]),
};
```

**Usage**:
- Access via `language.maps.forEach(virtualCode)`
- Returns mappings for all associated scripts
- Used for complex multi-file scenarios

### embeddedCodes?: VirtualCode[]

**Purpose**: Nested virtual codes within a parent virtual code.

**Use Cases**:
- Multi-part files (Vue: script, template, style)
- Embedded languages (HTML with embedded CSS/JS)
- Hierarchical code structures

**Example**:

```typescript
const virtualCode: VirtualCode = {
  id: 'root',
  languageId: 'typescript',
  snapshot: scriptSnapshot,
  mappings: scriptMappings,
  embeddedCodes: [
    {
      id: 'template',
      languageId: 'html',
      snapshot: templateSnapshot,
      mappings: templateMappings,
    },
    {
      id: 'style',
      languageId: 'css',
      snapshot: styleSnapshot,
      mappings: styleMappings,
    },
  ],
};
```

**Accessing Embedded Codes**:

```typescript
import { forEachEmbeddedCode } from '@volar/language-core';

// Iterate over all embedded codes (including root)
for (const code of forEachEmbeddedCode(virtualCode)) {
  console.log(`Found: ${code.id} (${code.languageId})`);
}
```

**Nested Structure**:
- Embedded codes can have their own embedded codes
- `forEachEmbeddedCode` recursively iterates all levels
- Each embedded code has its own mappings

### linkedCodeMappings?: Mapping[]

**Purpose**: Mappings for synchronized editing (e.g., HTML tag pairs).

**Use Cases**:
- Linked editing ranges (HTML tags)
- Synchronized regions
- Paired symbols

**Example**:

```typescript
const virtualCode: VirtualCode = {
  id: 'template',
  languageId: 'html',
  snapshot: templateSnapshot,
  mappings: templateMappings,
  linkedCodeMappings: [
    {
      sourceOffsets: [10],  // Opening tag
      generatedOffsets: [10],
      lengths: [5],
      data: {},
    },
    {
      sourceOffsets: [100], // Closing tag
      generatedOffsets: [100],
      lengths: [5],
      data: {},
    },
  ],
};
```

**Usage**:
- Accessed via `language.linkedCodeMaps.get(virtualCode)`
- Used by linked editing range feature
- Enables synchronized editing of paired elements

## Creating VirtualCode

### Step-by-Step Process

1. **Identify the source code**
2. **Transform to target language** (usually TypeScript)
3. **Create snapshot** of generated code
4. **Create mappings** between source and generated
5. **Set CodeInformation** flags
6. **Add embedded codes** (if needed)
7. **Return VirtualCode**

### Basic Example

```typescript
createVirtualCode(
  uri: URI,
  languageId: string,
  snapshot: IScriptSnapshot,
  ctx: CodegenContext<URI>
): VirtualCode | undefined {
  // Step 1: Get source code
  const sourceCode = snapshot.getText(0, snapshot.getLength());

  // Step 2: Transform to TypeScript
  const generatedCode = transformToTypeScript(sourceCode);

  // Step 3: Create snapshot
  const virtualSnapshot: IScriptSnapshot = {
    getText: (start, end) => generatedCode.substring(start, end),
    getLength: () => generatedCode.length,
    getChangeRange: () => undefined,
  };

  // Step 4: Create mappings
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

  // Step 5: Return VirtualCode
  return {
    id: 'main',
    languageId: 'typescript',
    snapshot: virtualSnapshot,
    mappings,
  };
}
```

### Complex Example with Embedded Codes

```typescript
createVirtualCode(
  uri: URI,
  languageId: string,
  snapshot: IScriptSnapshot,
  ctx: CodegenContext<URI>
): VirtualCode | undefined {
  const sourceCode = snapshot.getText(0, snapshot.getLength());

  // Extract parts
  const script = extractScript(sourceCode);
  const template = extractTemplate(sourceCode);
  const style = extractStyle(sourceCode);

  // Transform parts
  const scriptCode = transformScript(script);
  const templateCode = transformTemplate(template);
  const styleCode = transformStyle(style);

  // Create root virtual code
  const rootVirtualCode: VirtualCode = {
    id: 'root',
    languageId: 'typescript',
    snapshot: createSnapshot(scriptCode),
    mappings: createScriptMappings(sourceCode, scriptCode),
    embeddedCodes: [
      // Template embedded code
      {
        id: 'template',
        languageId: 'html',
        snapshot: createSnapshot(templateCode),
        mappings: createTemplateMappings(sourceCode, templateCode),
      },
      // Style embedded code
      {
        id: 'style',
        languageId: 'css',
        snapshot: createSnapshot(styleCode),
        mappings: createStyleMappings(sourceCode, styleCode),
      },
    ],
  };

  return rootVirtualCode;
}
```

## Using VirtualCode

### Accessing VirtualCode

VirtualCode is accessed through `SourceScript`:

```typescript
// Get source script
const sourceScript = language.scripts.get(uri);

if (sourceScript?.generated) {
  // Access root virtual code
  const virtualCode = sourceScript.generated.root;

  // Access embedded codes
  const embeddedCodes = sourceScript.generated.embeddedCodes;

  // Get specific embedded code
  const templateCode = embeddedCodes.get('template');
}
```

### Iterating Over Embedded Codes

```typescript
import { forEachEmbeddedCode } from '@volar/language-core';

const sourceScript = language.scripts.get(uri);
if (sourceScript?.generated) {
  // Iterate over all embedded codes (including root)
  for (const code of forEachEmbeddedCode(sourceScript.generated.root)) {
    console.log(`Code: ${code.id} (${code.languageId})`);
    console.log(`Length: ${code.snapshot.getLength()}`);
  }
}
```

### Getting Mappings

```typescript
const sourceScript = language.scripts.get(uri);
if (sourceScript?.generated) {
  const virtualCode = sourceScript.generated.root;

  // Get mapper for virtual code and source script
  const mapper = language.maps.get(virtualCode, sourceScript);

  // Map position from source to virtual code
  const sourceOffset = 50;
  for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(sourceOffset)) {
    console.log(`Source ${sourceOffset} → Virtual ${virtualOffset}`);
  }

  // Map position from virtual to source
  const virtualOffset = 100;
  for (const [sourceOffset, mapping] of mapper.toSourceLocation(virtualOffset)) {
    console.log(`Virtual ${virtualOffset} → Source ${sourceOffset}`);
  }
}
```

### Accessing Snapshot Content

```typescript
const virtualCode = sourceScript.generated.root;

// Get full content
const fullContent = virtualCode.snapshot.getText(0, virtualCode.snapshot.getLength());

// Get specific range
const range = virtualCode.snapshot.getText(10, 20);

// Get length
const length = virtualCode.snapshot.getLength();
```

## Updating VirtualCode

### Incremental Updates

Use `updateVirtualCode` for better performance:

```typescript
updateVirtualCode(
  uri: URI,
  virtualCode: VirtualCode,
  newSnapshot: IScriptSnapshot,
  ctx: CodegenContext<URI>
): VirtualCode | undefined {
  const oldSnapshot = virtualCode.snapshot;

  // Get change range
  const changeRange = oldSnapshot.getChangeRange(newSnapshot);

  if (!changeRange) {
    // No change range, fall back to full recreation
    return this.createVirtualCode(uri, 'my-lang', newSnapshot, ctx);
  }

  // Incrementally update
  const updatedCode = incrementallyUpdateCode(virtualCode, changeRange, newSnapshot);

  return updatedCode;
}
```

### Full Recreation

If incremental update is not possible:

```typescript
updateVirtualCode(uri, virtualCode, newSnapshot, ctx) {
  // Fall back to full recreation
  return this.createVirtualCode(uri, 'my-lang', newSnapshot, ctx);
}
```

### Updating Embedded Codes

When updating virtual code with embedded codes:

```typescript
updateVirtualCode(uri, virtualCode, newSnapshot, ctx) {
  const sourceCode = newSnapshot.getText(0, newSnapshot.getLength());

  // Update root code
  const updatedRoot = updateRootCode(virtualCode, sourceCode);

  // Update embedded codes
  const updatedEmbeddedCodes = virtualCode.embeddedCodes?.map(embedded => {
    if (embedded.id === 'template') {
      return updateTemplateCode(embedded, sourceCode);
    }
    if (embedded.id === 'style') {
      return updateStyleCode(embedded, sourceCode);
    }
    return embedded;
  });

  return {
    ...updatedRoot,
    embeddedCodes: updatedEmbeddedCodes,
  };
}
```

## VirtualCode Lifecycle

### Lifecycle Stages

1. **Creation**: `createVirtualCode` is called
2. **Registration**: VirtualCode is registered in `SourceScript.generated`
3. **Usage**: Language service features use VirtualCode
4. **Update**: `updateVirtualCode` is called on changes
5. **Disposal**: `disposeVirtualCode` is called when file closes

### Creation Flow

```
File Opened
    ↓
createVirtualCode() called
    ↓
VirtualCode created
    ↓
Registered in SourceScript.generated
    ↓
Embedded codes registered
    ↓
Mappings established
    ↓
Ready for use
```

### Update Flow

```
File Changed
    ↓
updateVirtualCode() called
    ↓
Change range calculated
    ↓
Incremental update OR full recreation
    ↓
VirtualCode updated
    ↓
Mappings updated
    ↓
Ready for use
```

### Disposal Flow

```
File Closed
    ↓
disposeVirtualCode() called
    ↓
Resources cleaned up
    ↓
VirtualCode removed from registry
```

## How VirtualCode Flows Through the System

### From LanguagePlugin to LanguageServicePlugin

```
Source File
    ↓
LanguagePlugin.createVirtualCode()
    ↓
VirtualCode created
    ↓
Registered in Language.scripts
    ↓
LanguageServicePlugin receives request
    ↓
Maps source position to virtual position
    ↓
Processes virtual code
    ↓
Maps result back to source position
    ↓
Returns to client
```

### Position Mapping Flow

```
User clicks at source position (line 10, col 5)
    ↓
LanguageServicePlugin receives position
    ↓
Maps source position to virtual position using Mapper
    ↓
Processes virtual code at virtual position
    ↓
Gets result (e.g., hover info, completion)
    ↓
Maps result range back to source range
    ↓
Returns to user
```

### Feature Processing Flow

```
Feature Request (e.g., hover)
    ↓
Get source script
    ↓
Get virtual code
    ↓
Get mapper
    ↓
Map source position to virtual position
    ↓
Filter by CodeInformation (e.g., semantic: true)
    ↓
Process virtual code
    ↓
Map result back to source
    ↓
Return result
```

## Common Patterns

### Pattern 1: Simple 1:1 Mapping

```typescript
const virtualCode: VirtualCode = {
  id: 'main',
  languageId: 'typescript',
  snapshot: createSnapshot(generatedCode),
  mappings: [
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
  ],
};
```

### Pattern 2: Multiple Mapped Regions

```typescript
const virtualCode: VirtualCode = {
  id: 'main',
  languageId: 'typescript',
  snapshot: createSnapshot(generatedCode),
  mappings: [
    // Region 1: Header
    {
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [10],
      data: { verification: false, navigation: false },
    },
    // Region 2: Code
    {
      sourceOffsets: [10],
      generatedOffsets: [20],
      lengths: [100],
      data: { verification: true, navigation: true },
    },
    // Region 3: Footer
    {
      sourceOffsets: [110],
      generatedOffsets: [130],
      lengths: [10],
      data: { verification: false, navigation: false },
    },
  ],
};
```

### Pattern 3: Embedded Codes

```typescript
const virtualCode: VirtualCode = {
  id: 'root',
  languageId: 'typescript',
  snapshot: scriptSnapshot,
  mappings: scriptMappings,
  embeddedCodes: [
    {
      id: 'template',
      languageId: 'html',
      snapshot: templateSnapshot,
      mappings: templateMappings,
    },
    {
      id: 'style',
      languageId: 'css',
      snapshot: styleSnapshot,
      mappings: styleMappings,
    },
  ],
};
```

### Pattern 4: TypeScript Pass-Through

```typescript
// TypeScript files are their own virtual code
const virtualCode: VirtualCode = {
  id: 'main',
  languageId: 'typescript',
  snapshot: sourceSnapshot, // Same as source
  mappings: [
    {
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [sourceSnapshot.getLength()],
      data: {
        verification: true,
        navigation: true,
        completion: true,
        semantic: true,
        structure: true,
        format: true,
      },
    },
  ],
};
```

## Related Documentation

- [Language Plugin Complete Guide](./language-plugin-complete-guide.md) - Creating LanguagePlugins
- [Mapping System Guide](./mapping-system-guide.md) - Understanding mappings
- [Script Snapshot Guide](./script-snapshot-guide.md) - Working with snapshots
- [SourceScript and Language System](./source-script-language-system.md) - Script registry
- [Advanced Patterns](./advanced-patterns.md) - Advanced VirtualCode patterns
- [Integration Guide](./integration-guide.md) - How VirtualCode integrates with the system

