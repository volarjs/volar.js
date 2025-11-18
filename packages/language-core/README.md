# @volar/language-core

The foundation of Volar.js, providing core language processing functionalities including virtual code creation, source-to-virtual code mapping, and the language plugin system.

## Overview

`@volar/language-core` is the base layer of Volar.js. It provides the fundamental abstractions and mechanisms for:

- Creating and managing virtual code representations
- Mapping between source code and generated virtual code
- Managing source scripts and their relationships
- Plugin system for language processing

## Installation

```bash
npm install @volar/language-core
```

## Core Concepts

### Language

A `Language` instance manages the language processing system. It provides:

- **Scripts registry**: Manages source files and their virtual code
- **Mapping system**: Translates positions between source and virtual code
- **Plugin system**: Executes language plugins to generate virtual code

### SourceScript

Represents an original source file:

```typescript
interface SourceScript<T> {
  id: T; // Unique identifier (typically URI)
  languageId: string; // Language of the source file
  snapshot: IScriptSnapshot; // File content snapshot
  generated?: {
    // Generated virtual code
    root: VirtualCode;
    languagePlugin: LanguagePlugin<T>;
    embeddedCodes: Map<string, VirtualCode>;
  };
  associatedIds: Set<T>; // Related source scripts
  targetIds: Set<T>; // Scripts that depend on this one
}
```

### VirtualCode

Represents generated code derived from a source file:

```typescript
interface VirtualCode {
  id: string; // Unique identifier
  languageId: string; // Language of generated code
  snapshot: IScriptSnapshot; // Generated code content
  mappings: CodeMapping[]; // Source mappings
  embeddedCodes?: VirtualCode[]; // Nested virtual codes
  linkedCodeMappings?: Mapping[]; // Linked code mappings
}
```

### LanguagePlugin

Transforms source files into virtual code:

```typescript
interface LanguagePlugin<T> {
  getLanguageId(scriptId: T): string | undefined;
  createVirtualCode?(
    scriptId: T,
    languageId: string,
    snapshot: IScriptSnapshot,
    ctx: CodegenContext<T>
  ): VirtualCode | undefined;
  updateVirtualCode?(
    scriptId: T,
    virtualCode: VirtualCode,
    newSnapshot: IScriptSnapshot,
    ctx: CodegenContext<T>
  ): VirtualCode | undefined;
  disposeVirtualCode?(scriptId: T, virtualCode: VirtualCode): void;
  isAssociatedFileOnly?(scriptId: T, languageId: string): boolean;
}
```

### CodeInformation

Controls which language features are enabled for code regions:

```typescript
interface CodeInformation {
  verification?: boolean | { shouldReport?(source, code): boolean };
  completion?: boolean | { isAdditional?: boolean; onlyImport?: boolean };
  semantic?: boolean | { shouldHighlight?(): boolean };
  navigation?:
    | boolean
    | {
        shouldHighlight?(): boolean;
        shouldRename?(): boolean;
        resolveRenameNewName?(newName: string): string;
        resolveRenameEditText?(newText: string): string;
      };
  structure?: boolean;
  format?: boolean;
}
```

### Mapper

Translates positions between source and virtual code:

```typescript
interface Mapper {
  mappings: Mapping<CodeInformation>[];
  toSourceRange(start, end, fallbackToAnyMatch, filter?): Generator<...>;
  toGeneratedRange(start, end, fallbackToAnyMatch, filter?): Generator<...>;
  toSourceLocation(generatedOffset, filter?): Generator<...>;
  toGeneratedLocation(sourceOffset, filter?): Generator<...>;
}
```

## API Reference

### createLanguage

Creates a `Language` instance for managing language processing.

```typescript
function createLanguage<T>(
  plugins: LanguagePlugin<T>[],
  scriptRegistry: Map<T, SourceScript<T>>,
  sync: (id: T, includeFsFiles: boolean, shouldRegister: boolean) => void,
  onAssociationDirty?: (targetId: T) => void
): Language<T>;
```

**Parameters:**

- `plugins`: Array of language plugins to use
- `scriptRegistry`: Map to store source scripts
- `sync`: Function to synchronize scripts (load from file system, etc.)
- `onAssociationDirty`: Optional callback when associations become dirty

**Returns:** A `Language` instance

**Example:**

```typescript
import { createLanguage } from "@volar/language-core";
import { URI } from "vscode-uri";

const scriptRegistry = new Map<URI, SourceScript<URI>>();

const language = createLanguage(
  [myLanguagePlugin],
  scriptRegistry,
  (uri, includeFsFiles, shouldRegister) => {
    // Load file from file system
    const content = fs.readFileSync(uri.fsPath, "utf-8");
    const snapshot = createSnapshot(content);
    language.scripts.set(uri, snapshot, "typescript");
  }
);
```

### Language.scripts

Manages source scripts:

#### get

Retrieves a source script by ID.

```typescript
get(id: T, includeFsFiles?: boolean, shouldRegister?: boolean): SourceScript<T> | undefined
```

#### set

Creates or updates a source script.

```typescript
set(
  id: T,
  snapshot: IScriptSnapshot,
  languageId?: string,
  plugins?: LanguagePlugin<T>[]
): SourceScript<T> | undefined
```

#### delete

Removes a source script.

```typescript
delete(id: T): void
```

#### fromVirtualCode

Gets the source script that generated a virtual code.

```typescript
fromVirtualCode(virtualCode: VirtualCode): SourceScript<T>
```

### Language.maps

Provides mapping between virtual code and source scripts:

#### get

Gets a mapper for a virtual code and source script pair.

```typescript
get(virtualCode: VirtualCode, sourceScript: SourceScript<T>): Mapper
```

#### forEach

Iterates over all source scripts and their mappers for a virtual code.

```typescript
forEach(virtualCode: VirtualCode): Generator<[SourceScript<T>, Mapper]>
```

### Language.linkedCodeMaps

Manages linked code mappings:

#### get

Gets the linked code map for a virtual code.

```typescript
get(virtualCode: VirtualCode): LinkedCodeMap | undefined
```

### forEachEmbeddedCode

Recursively iterates over all embedded codes in a virtual code.

```typescript
function* forEachEmbeddedCode(virtualCode: VirtualCode): Generator<VirtualCode>;
```

## Utility Functions

### CodeInformation Checks

Functions to check if features are enabled for `CodeInformation`:

- `isHoverEnabled(info)`: Checks if hover is enabled
- `isCompletionEnabled(info)`: Checks if completion is enabled
- `isDiagnosticsEnabled(info)`: Checks if diagnostics are enabled
- `isDefinitionEnabled(info)`: Checks if go-to-definition is enabled
- `isRenameEnabled(info)`: Checks if rename is enabled
- `isFormattingEnabled(info)`: Checks if formatting is enabled
- And many more...

### Helper Functions

- `shouldReportDiagnostics(info, source, code)`: Determines if diagnostics should be reported
- `resolveRenameNewName(newName, info)`: Resolves rename new name
- `resolveRenameEditText(text, info)`: Resolves rename edit text
- `findOverlapCodeRange(start, end, map, filter)`: Finds overlapping code range

## Examples

### Creating a Simple LanguagePlugin

```typescript
import type {
  LanguagePlugin,
  VirtualCode,
  IScriptSnapshot,
} from "@volar/language-core";
import { URI } from "vscode-uri";

const myPlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    if (uri.fsPath.endsWith(".myext")) {
      return "my-lang";
    }
  },

  createVirtualCode(uri, languageId, snapshot, ctx) {
    if (languageId !== "my-lang") return;

    // Generate virtual code
    const sourceCode = snapshot.getText(0, snapshot.getLength());
    const generatedCode = transformToTypeScript(sourceCode);

    return {
      id: "main",
      languageId: "typescript",
      snapshot: createSnapshot(generatedCode),
      mappings: createMappings(sourceCode, generatedCode, {
        verification: true,
        navigation: true,
        completion: true,
      }),
    };
  },
};
```

### Working with VirtualCode

```typescript
import { createLanguage } from "@volar/language-core";
import { URI } from "vscode-uri";

// Get source script
const sourceScript = language.scripts.get(uri);

if (sourceScript?.generated) {
  const virtualCode = sourceScript.generated.root;

  // Get mapper
  const mapper = language.maps.get(virtualCode, sourceScript);

  // Map position from source to virtual code
  for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
    sourceOffset
  )) {
    console.log(`Source ${sourceOffset} maps to virtual ${virtualOffset}`);
  }

  // Iterate over all embedded codes
  for (const embedded of forEachEmbeddedCode(virtualCode)) {
    console.log(`Embedded code: ${embedded.id} (${embedded.languageId})`);
  }
}
```

### Using CodeInformation

```typescript
import { createSnapshot } from "@volar/language-core";

const virtualCode: VirtualCode = {
  id: "main",
  languageId: "typescript",
  snapshot: createSnapshot("const x = 1;"),
  mappings: [
    {
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [10],
      data: {
        verification: true, // Enable diagnostics
        navigation: true, // Enable go-to-definition
        completion: true, // Enable code completion
        semantic: true, // Enable hover
        structure: true, // Enable document symbols
        format: true, // Enable formatting
      },
    },
  ],
};
```

## Comprehensive Guides

For detailed guides on LanguagePlugin and VirtualCode:

- **[Language Plugin Complete Guide](../../docs/guides/language-plugin-complete-guide.md)** - Complete LanguagePlugin reference with all methods and lifecycle
- **[VirtualCode Complete Reference](../../docs/guides/virtualcode-complete-reference.md)** - Complete VirtualCode reference covering all properties, creation, usage, and updates
- **[Mapping System Guide](../../docs/guides/mapping-system-guide.md)** - Understanding Mapping structure, CodeInformation, and Mapper usage
- **[Script Snapshot Guide](../../docs/guides/script-snapshot-guide.md)** - Working with IScriptSnapshot and incremental updates
- **[SourceScript and Language System](../../docs/guides/source-script-language-system.md)** - Script registry, lifecycle, and association system
- **[Advanced Patterns](../../docs/guides/advanced-patterns.md)** - Advanced patterns including embedded codes, multi-file plugins, and TypeScript integration
- **[Integration Guide](../../docs/guides/integration-guide.md)** - How LanguagePlugin, VirtualCode, and LanguageServicePlugin work together

## Related Documentation

- [Architecture Guide](../../docs/ARCHITECTURE.md) - System architecture overview
- [Plugin System](../../docs/PLUGINS.md) - Creating language plugins
- [Data Flow](../../docs/DATA_FLOW.md) - How data flows through the system

## See Also

- [@volar/language-service](../language-service/README.md) - Language service features built on top of language-core
- [@volar/source-map](../source-map/README.md) - Source mapping utilities
