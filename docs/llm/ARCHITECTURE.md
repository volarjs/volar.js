# Architecture (LLM-Optimized)

High-level architecture explanation optimized for LLM consumption.

## System Overview

Volar.js is a language service framework with a layered architecture:

1. **Core Layer** (`@volar/language-core`): Virtual code generation and mapping
2. **Service Layer** (`@volar/language-service`): Language features (completion, hover, etc.)
3. **Server Layer** (`@volar/language-server`): LSP protocol implementation
4. **Client Layer** (`@volar/vscode`, `@volar/monaco`): Editor integration

## Core Concepts

### VirtualCode

Generated code representation. Created from source files by LanguagePlugins. Core abstraction enabling language service features for any language.

**Properties**:

- `id`: Unique identifier (e.g., "main", "script", "template", "style")
- `languageId`: Language of generated code (typically "typescript" for type checking)
- `snapshot`: Immutable snapshot of generated code content
- `mappings`: CodeMapping[] - Mappings from source to virtual code with CodeInformation
- `associatedScriptMappings`: Optional mappings to multiple source scripts (multi-file scenarios)
- `embeddedCodes`: Optional nested virtual codes (e.g., template/style in Vue files)
- `linkedCodeMappings`: Optional mappings for synchronized editing (e.g., HTML tag pairs)

**Key Concepts**:
- Every position in virtual code maps back to source positions
- CodeInformation controls which features are enabled for each region
- Embedded codes enable multi-part files (Vue, Svelte)
- Mappings enable bidirectional position translation

### SourceScript

Represents an original source file.

**Properties**:

- `id`: File identifier (URI)
- `languageId`: Source file language
- `snapshot`: File content
- `generated`: VirtualCode created from this source

### LanguagePlugin

Transforms source files into VirtualCode. Foundation of language processing in Volar.js.

**Key Methods**:

- `getLanguageId(scriptId)`: Identify file language (called for file detection)
- `createVirtualCode(scriptId, languageId, snapshot, ctx)`: Generate virtual code (called on file open/change)
- `updateVirtualCode(scriptId, virtualCode, newSnapshot, ctx)`: Incrementally update virtual code (optional, for performance)
- `disposeVirtualCode(scriptId, virtualCode)`: Clean up resources (called on file close)
- `isAssociatedFileOnly(scriptId, languageId)`: Mark files as source-only (for TypeScript integration)

**Lifecycle**:
1. Registration when creating Language instance
2. File detection via `getLanguageId()`
3. Virtual code creation via `createVirtualCode()`
4. Incremental updates via `updateVirtualCode()` (if implemented)
5. Cleanup via `disposeVirtualCode()` when file closes

**CodegenContext**:
- Provides `getAssociatedScript(scriptId)` for accessing related files
- Used for multi-file languages and file dependencies

### LanguageServicePlugin

Provides language service features.

**Key Methods**:

- Feature providers (provideCompletionItems, provideHover, etc.)
- Dependency injection via `context.inject()`

## Data Flow

### File Processing Flow

1. **File Opens**: Source file → `language.scripts.get()` → `sync()` function loads file
2. **Script Registration**: `language.scripts.set()` → Creates `SourceScript`
3. **Virtual Code Generation**: `LanguagePlugin.createVirtualCode()` → Creates `VirtualCode` with mappings
4. **Registration**: VirtualCode stored in `SourceScript.generated.root`
5. **Embedded Codes**: Nested virtual codes registered in `SourceScript.generated.embeddedCodes`

### Feature Request Flow

1. **Request Received**: Language service receives feature request (e.g., hover, completion)
2. **Get Source Script**: `language.scripts.get(uri)` → Get `SourceScript`
3. **Get Virtual Code**: `sourceScript.generated.root` → Get `VirtualCode`
4. **Get Mapper**: `language.maps.get(virtualCode, sourceScript)` → Get `Mapper`
5. **Map Position**: `mapper.toGeneratedLocation(sourceOffset, filter)` → Map to virtual position
6. **Process Virtual Code**: Language service processes virtual code at virtual position
7. **Map Result**: `mapper.toSourceRange(virtualRange, filter)` → Map result back to source
8. **Return Result**: Return result with source positions to client

### Update Flow

1. **File Changes**: File content changes → New snapshot created
2. **Update Detection**: `language.scripts.set()` detects change
3. **Incremental Update**: `LanguagePlugin.updateVirtualCode()` called (if implemented)
4. **Change Range**: `snapshot.getChangeRange(oldSnapshot)` calculates change
5. **Update or Recreate**: Incrementally update or fully recreate virtual code
6. **Update Mappings**: Mappings updated to reflect changes
7. **Dirty Flags**: Dependent files marked as `isAssociationDirty`

## System Boundaries

### LanguagePlugin Boundary

- **Input**: Source file (SourceScript)
- **Output**: VirtualCode with mappings
- **Responsibility**: Code generation and mapping

### LanguageServicePlugin Boundary

- **Input**: VirtualCode, document, position
- **Output**: Language feature results (completions, hover, etc.)
- **Responsibility**: Feature implementation

### Language Server Boundary

- **Input**: LSP requests
- **Output**: LSP responses
- **Responsibility**: Protocol handling, project management

## Data Structures

### Mapping

Connects source and virtual code positions:

```typescript
{
  sourceOffsets: number[],
  generatedOffsets: number[],
  lengths: number[],
  data: CodeInformation
}
```

### CodeInformation

Controls which features are enabled:

```typescript
{
  verification?: boolean,  // Diagnostics, code actions
  completion?: boolean,     // Code completion
  semantic?: boolean,       // Hover, semantic tokens
  navigation?: boolean,    // Go-to-definition, references
  structure?: boolean,     // Document symbols
  format?: boolean         // Formatting
}
```

## Key Relationships

- **LanguagePlugin** creates **VirtualCode** from **SourceScript**
- **LanguageServicePlugin** processes **VirtualCode** to provide features
- **Mapper** translates positions between source and virtual code
- **LanguageService** coordinates plugins and handles requests
