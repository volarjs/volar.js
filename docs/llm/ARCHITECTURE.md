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

Generated code representation. Created from source files by LanguagePlugins.

**Properties**:

- `id`: Unique identifier
- `languageId`: Language of generated code (e.g., "typescript")
- `snapshot`: Code content
- `mappings`: Source mappings
- `embeddedCodes`: Nested virtual codes

### SourceScript

Represents an original source file.

**Properties**:

- `id`: File identifier (URI)
- `languageId`: Source file language
- `snapshot`: File content
- `generated`: VirtualCode created from this source

### LanguagePlugin

Transforms source files into VirtualCode.

**Key Methods**:

- `getLanguageId()`: Identify file language
- `createVirtualCode()`: Generate virtual code
- `updateVirtualCode()`: Incrementally update virtual code

### LanguageServicePlugin

Provides language service features.

**Key Methods**:

- Feature providers (provideCompletionItems, provideHover, etc.)
- Dependency injection via `context.inject()`

## Data Flow

1. Source file → SourceScript (via `language.scripts.set()`)
2. SourceScript → VirtualCode (via `LanguagePlugin.createVirtualCode()`)
3. Language service request → Map position to VirtualCode
4. Feature provider → Process virtual code
5. Results → Map back to source positions

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
