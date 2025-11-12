# Type Definitions (LLM-Optimized)

Major type definitions with explanations, relationships, and generic parameters.

## Core Types

### LanguagePlugin<T>

Generic plugin for transforming source files to virtual code.

**Generic Parameters**:

- `T`: Script identifier type (typically `URI`)

**Key Methods**:

- `getLanguageId(scriptId: T): string | undefined`
- `createVirtualCode(scriptId, languageId, snapshot, ctx): VirtualCode | undefined`

**Example**:

```typescript
const plugin: LanguagePlugin<URI> = { ... };
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

Generated code representation.

**Properties**:

- `id: string` - Unique identifier
- `languageId: string` - Language of generated code
- `snapshot: IScriptSnapshot` - Code content
- `mappings: CodeMapping[]` - Source mappings
- `embeddedCodes?: VirtualCode[]` - Nested codes

**Relationships**:

- Created by `LanguagePlugin`
- Used by `LanguageServicePlugin`
- Contains `CodeMapping` with `CodeInformation`

---

### SourceScript<T>

Source file representation.

**Generic Parameters**:

- `T`: Script identifier type

**Properties**:

- `id: T` - File identifier
- `languageId: string` - Source language
- `snapshot: IScriptSnapshot` - File content
- `generated?: { root: VirtualCode, ... }` - Generated virtual code

**Relationships**:

- Contains `VirtualCode` in `generated.root`
- Managed by `Language.scripts`

---

### CodeInformation

Controls which language features are enabled.

**Properties**:

- `verification?: boolean | { shouldReport?() }` - Diagnostics, code actions
- `completion?: boolean | { isAdditional?, onlyImport? }` - Code completion
- `semantic?: boolean | { shouldHighlight?() }` - Hover, semantic tokens
- `navigation?: boolean | { shouldHighlight?(), shouldRename?(), ... }` - Go-to-definition
- `structure?: boolean` - Document symbols
- `format?: boolean` - Formatting

**Usage**:
Attached to `CodeMapping.data` to control feature availability.

---

### Mapping<Data>

Source mapping between source and generated code.

**Generic Parameters**:

- `Data`: Data type (typically `CodeInformation`)

**Properties**:

- `sourceOffsets: number[]` - Positions in source
- `generatedOffsets: number[]` - Positions in generated code
- `lengths: number[]` - Lengths of mapped regions
- `data: Data` - Associated data (e.g., CodeInformation)

**Relationships**:

- Used by `SourceMap` for position translation
- Contains `CodeInformation` in `data` field

---

### Mapper

Translates positions between source and virtual code.

**Methods**:

- `toSourceLocation(generatedOffset, filter?)` - Map to source
- `toGeneratedLocation(sourceOffset, filter?)` - Map to generated
- `toSourceRange(start, end, fallback, filter?)` - Map range to source
- `toGeneratedRange(start, end, fallback, filter?)` - Map range to generated

**Relationships**:

- Created from `Mapping[]` by `MapperFactory`
- Used by language service for position translation

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

Immutable snapshot of code content.

**Methods**:

- `getText(start, end): string` - Get text range
- `getLength(): number` - Get length
- `getChangeRange(oldSnapshot): TextChangeRange | undefined` - Get changes

**Relationships**:

- Used by `SourceScript.snapshot`
- Used by `VirtualCode.snapshot`

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
