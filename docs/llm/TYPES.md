# Type Definitions (LLM-Optimized)

Major type definitions with explanations, relationships, and generic parameters.

## Core Types

### LanguagePlugin<T, K extends VirtualCode>

Generic plugin for transforming source files to virtual code.

**Generic Parameters**:

- `T`: Script identifier type (typically `URI`)
- `K`: Virtual code type (extends `VirtualCode`, allows custom virtual code types)

**Key Methods**:

- `getLanguageId(scriptId: T): string | undefined` - Identifies file language
- `createVirtualCode?(scriptId, languageId, snapshot, ctx): K | undefined` - Creates virtual code
- `updateVirtualCode?(scriptId, virtualCode, newSnapshot, ctx): K | undefined` - Incrementally updates virtual code
- `disposeVirtualCode?(scriptId, virtualCode): void` - Cleans up resources
- `isAssociatedFileOnly?(scriptId, languageId): boolean` - Marks files as source-only

**Lifecycle**:
1. Registration when creating Language instance
2. File detection via `getLanguageId()`
3. Virtual code creation via `createVirtualCode()`
4. Incremental updates via `updateVirtualCode()` (if implemented)
5. Cleanup via `disposeVirtualCode()` when file closes

**Example**:

```typescript
const plugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    return uri.fsPath.endsWith('.vue') ? 'vue' : undefined;
  },
  createVirtualCode(uri, languageId, snapshot, ctx) {
    // Transform source to virtual code
    return { id: 'main', languageId: 'typescript', snapshot, mappings: [] };
  }
};
```

---

### LanguageServicePlugin<P>

Plugin for providing language service features.

**Generic Parameters**:

- `P`: Plugin-specific provide type

**Key Properties**:

- `capabilities`: Feature capabilities object
- `create(context): LanguageServicePluginInstance`

**Example**:

```typescript
const plugin: LanguageServicePlugin = {
  capabilities: { hoverProvider: true },
  create(context) { return { provide: { ... } }; }
};
```

---

### VirtualCode

Generated code representation. Core abstraction for code transformation in Volar.js.

**Properties**:

- `id: string` - Unique identifier (e.g., "main", "script", "template", "style")
- `languageId: string` - Language of generated code (typically "typescript" or "javascript")
- `snapshot: IScriptSnapshot` - Immutable snapshot of generated code content
- `mappings: CodeMapping[]` - Mappings from source code to this virtual code
- `associatedScriptMappings?: Map<unknown, CodeMapping[]>` - Mappings to multiple source scripts (multi-file scenarios)
- `embeddedCodes?: VirtualCode[]` - Nested virtual codes (e.g., template/style in Vue files)
- `linkedCodeMappings?: Mapping[]` - Mappings for synchronized editing (e.g., HTML tag pairs)

**Creation Flow**:
1. Source file → LanguagePlugin.createVirtualCode()
2. Transform source to target language (usually TypeScript)
3. Create snapshot of generated code
4. Create mappings between source and generated positions
5. Set CodeInformation flags for each mapped region
6. Return VirtualCode

**Usage Flow**:
1. Access via SourceScript.generated.root
2. Get mapper via language.maps.get(virtualCode, sourceScript)
3. Map positions between source and virtual code
4. Process virtual code with language service features
5. Map results back to source positions

**Update Flow**:
1. File changes → updateVirtualCode() called
2. Calculate change range via snapshot.getChangeRange()
3. Incrementally update or fully recreate
4. Update mappings to reflect changes

**Relationships**:

- Created by `LanguagePlugin`
- Stored in `SourceScript.generated.root`
- Used by `LanguageServicePlugin` for feature processing
- Contains `CodeMapping` with `CodeInformation` for feature control

---

### SourceScript<T>

Source file representation. Stores original source file and its generated virtual code.

**Generic Parameters**:

- `T`: Script identifier type (typically `URI`)

**Properties**:

- `id: T` - File identifier (typically URI)
- `languageId: string` - Source file language (from `getLanguageId()`)
- `snapshot: IScriptSnapshot` - Immutable snapshot of file content
- `targetIds: Set<T>` - Scripts that depend on this script (e.g., files that import this)
- `associatedIds: Set<T>` - Scripts this file depends on (e.g., files this imports)
- `associatedOnly: boolean` - If true, file is only used as source for generated files
- `isAssociationDirty?: boolean` - Flag indicating associations need recalculation
- `generated?: { root: VirtualCode, languagePlugin: LanguagePlugin<T>, embeddedCodes: Map<string, VirtualCode> }` - Generated virtual code
  - `root`: Main virtual code
  - `languagePlugin`: Plugin that created the virtual code
  - `embeddedCodes`: Map of embedded virtual codes by ID

**Lifecycle**:
1. Created via `language.scripts.set()`
2. Virtual code generated via `LanguagePlugin.createVirtualCode()`
3. Updated via `language.scripts.set()` when file changes
4. Deleted via `language.scripts.delete()` when file closes

**Relationships**:

- Contains `VirtualCode` in `generated.root`
- Managed by `Language.scripts` registry
- Associations tracked via `targetIds` and `associatedIds`

---

### CodeInformation

Controls which language features are enabled for each mapped code region. Attached to `CodeMapping.data`.

**Properties**:

- `verification?: boolean | { shouldReport?(source, code): boolean }` - Controls diagnostics and code actions
  - When `true`: Enable all diagnostics and code actions
  - Object form: Filter specific diagnostics via `shouldReport()` callback
- `completion?: boolean | { isAdditional?: boolean, onlyImport?: boolean }` - Controls code completion
  - `isAdditional`: Merge with other completions
  - `onlyImport`: Only show import completions
- `semantic?: boolean | { shouldHighlight?(): boolean }` - Controls semantic features
  - Features: hover, inlay hints, code lens, semantic tokens, moniker, inline values
- `navigation?: boolean | { shouldHighlight?(), shouldRename?(), resolveRenameNewName?(newName), resolveRenameEditText?(newText) }` - Controls navigation features
  - Features: go-to-definition, type definition, references, implementations, document highlights, rename
- `structure?: boolean` - Controls structure features
  - Features: document symbols, folding ranges, selection ranges, linked editing, colors, document links
- `format?: boolean` - Controls formatting features

**Usage Pattern**:
```typescript
mappings: [{
  sourceOffsets: [0],
  generatedOffsets: [0],
  lengths: [100],
  data: {
    verification: true,   // Enable diagnostics
    navigation: true,     // Enable go-to-definition
    completion: true,     // Enable completion
    semantic: true,       // Enable hover
    structure: true,      // Enable outline
    format: true,         // Enable formatting
  }
}]
```

**Filtering in Features**:
- Mapper methods accept filter functions: `(data: CodeInformation) => boolean`
- Example: `mapper.toGeneratedLocation(offset, (data) => data.semantic === true)`

---

### Mapping<Data>

Source mapping between source and generated code positions.

**Generic Parameters**:

- `Data`: Data type (typically `CodeInformation`)

**Properties**:

- `sourceOffsets: number[]` - Array of start positions in source code
- `generatedOffsets: number[]` - Array of start positions in generated code
- `lengths: number[]` - Lengths of mapped regions in source
- `generatedLengths?: number[]` - Lengths of mapped regions in generated (optional, defaults to `lengths`)
- `data: Data` - Associated data (typically `CodeInformation`)

**Array Requirements**:
- All arrays must have the same length
- Each index represents one mapped region
- Example: `sourceOffsets[0]` maps to `generatedOffsets[0]` with length `lengths[0]`

**Offset System**:
- Zero-based offsets
- Half-open intervals `[start, end)` - end is exclusive
- Example: Offset 0-5 covers characters at positions 0, 1, 2, 3, 4

**Relationships**:

- Used by `SourceMap` for position translation
- Contains `CodeInformation` in `data` field when used as `CodeMapping`
- Multiple mappings can overlap (same source position can map to multiple virtual positions)

---

### Mapper

Translates positions between source and virtual code. Provides bidirectional position mapping.

**Methods**:

- `toSourceLocation(generatedOffset, filter?)` - Map single offset from generated to source
  - Returns: Generator of `[sourceOffset, Mapping]` tuples
  - Filter: Optional function to filter by CodeInformation
- `toGeneratedLocation(sourceOffset, filter?)` - Map single offset from source to generated
  - Returns: Generator of `[generatedOffset, Mapping]` tuples
- `toSourceRange(start, end, fallbackToAnyMatch, filter?)` - Map range from generated to source
  - `fallbackToAnyMatch`: If true, allows start and end to come from different mappings
  - Returns: Generator of `[sourceStart, sourceEnd, startMapping, endMapping]` tuples
- `toGeneratedRange(start, end, fallbackToAnyMatch, filter?)` - Map range from source to generated
  - Returns: Generator of `[generatedStart, generatedEnd, startMapping, endMapping]` tuples

**Usage Pattern**:
```typescript
const mapper = language.maps.get(virtualCode, sourceScript);

// Map source position to virtual position
for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
  sourceOffset,
  (data) => data.semantic === true // Filter by CodeInformation
)) {
  // Process at virtualOffset
}

// Map virtual range back to source
for (const [sourceStart, sourceEnd] of mapper.toSourceRange(
  virtualStart,
  virtualEnd,
  false, // Strict matching
  (data) => data.verification === true
)) {
  // Use source range
}
```

**Relationships**:

- Created from `Mapping[]` by `MapperFactory` (default: `SourceMap`)
- Cached per virtual code and source script pair
- Used by language service for position translation
- Performance: O(log n) after initial O(n log n) memoization

---

## Service Types

### LanguageService

Main language service interface.

**Methods**:

- `getCompletionItems(uri, position, ...)` - Get completions
- `getHover(uri, position, ...)` - Get hover
- `getDiagnostics(uri, ...)` - Get diagnostics
- 30+ other feature methods

**Relationships**:

- Created by `createLanguageService()`
- Uses `Language` and `LanguageServicePlugin[]`

---

### LanguageServiceContext

Context provided to service plugins.

**Properties**:

- `language: Language` - Language instance
- `project: ProjectContext` - Project context
- `env: LanguageServiceEnvironment` - Environment
- `inject(key, ...args)` - Dependency injection
- `documents: { get(uri, languageId, snapshot) }` - Document registry

**Relationships**:

- Created by `createLanguageService()`
- Passed to `LanguageServicePlugin.create()`

---

## Server Types

### LanguageServerProject

Manages language services for a workspace.

**Methods**:

- `setup(server)` - Setup project
- `getLanguageService(uri)` - Get service for file
- `reload()` - Reload project

**Types**:

- `TypeScriptProject` - TypeScript project with tsconfig
- `SimpleProject` - Simple project without TypeScript

---

## Utility Types

### IScriptSnapshot

Immutable snapshot of code content. Provides efficient access to file content and change tracking.

**Methods**:

- `getText(start, end): string` - Get text range using half-open interval `[start, end)`
  - `start`: Inclusive start offset
  - `end`: Exclusive end offset
- `getLength(): number` - Get total length of content (should be O(1))
- `getChangeRange(oldSnapshot): TextChangeRange | undefined` - Get change range for incremental updates
  - Returns `undefined` if change range cannot be determined
  - Used by `updateVirtualCode()` for incremental updates
- `dispose?(): void` - Optional cleanup method for resources

**TextChangeRange Structure**:
```typescript
{
  span: { start: number, length: number }, // Changed region in old snapshot
  newLength: number // Length of new content that replaced the span
}
```

**Creation Pattern**:
```typescript
const snapshot: IScriptSnapshot = {
  getText: (start, end) => content.substring(start, end),
  getLength: () => content.length,
  getChangeRange: (oldSnapshot) => {
    // Calculate change range or return undefined
    return undefined;
  },
  dispose: () => {
    // Clean up resources if needed
  }
};
```

**Relationships**:

- Used by `SourceScript.snapshot` for source file content
- Used by `VirtualCode.snapshot` for generated code content
- Enables incremental updates via `getChangeRange()`

---

### URI

Uniform Resource Identifier (from `vscode-uri`).

**Usage**:

- Script identifiers in `Language<URI>`
- Document URIs in language service
- File paths in projects

---

## Type Relationships

```
LanguagePlugin<T>
    ↓ creates
VirtualCode
    ↓ contains
CodeMapping<CodeInformation>
    ↓ used by
Mapper
    ↓ used by
LanguageService
    ↓ uses
LanguageServicePlugin
```

```
SourceScript<T>
    ↓ generates
VirtualCode
    ↓ processed by
LanguageServicePlugin
    ↓ provides
Language Features
```
