# Volar.js Architecture

This document provides a comprehensive overview of the Volar.js architecture, including system design, data flow, and core concepts.

## Table of Contents

- [System Overview](#system-overview)
- [Package Dependency Graph](#package-dependency-graph)
- [Core Concepts](#core-concepts)
- [Data Flow](#data-flow)
- [Plugin System](#plugin-system)
- [Mapping System](#mapping-system)
- [Language Service Features](#language-service-features)

## System Overview

Volar.js is built on a layered architecture where each layer provides specific functionality and builds upon the layers below it.

```
┌─────────────────────────────────────────────────────────────┐
│                    Editor Integration                        │
│  @volar/vscode  │  @volar/monaco  │  @volar/kit            │
│  (LSP Client)   │  (Monaco Worker) │  (Node.js API)         │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│              Language Server Protocol                        │
│              @volar/language-server                         │
│  (LSP Server Implementation)                                │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│              Language Service Layer                          │
│              @volar/language-service                        │
│  (30+ Features: Completion, Hover, Diagnostics, etc.)      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│              Core Language Processing                        │
│              @volar/language-core                           │
│  (VirtualCode, SourceScript, LanguagePlugin)                │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│              Supporting Infrastructure                       │
│  @volar/typescript  │  @volar/source-map  │  @volar/jsdelivr│
└─────────────────────────────────────────────────────────────┘
```

## Package Dependency Graph

```
@volar/language-core
  ├── @volar/source-map
  │
  ├── @volar/language-service
  │     ├── @volar/language-core
  │     └── @volar/language-server
  │           ├── @volar/language-core
  │           ├── @volar/language-service
  │           └── @volar/typescript
  │                 └── @volar/language-core
  │
  ├── @volar/kit
  │     ├── @volar/language-service
  │     └── @volar/typescript
  │
  ├── @volar/monaco
  │     ├── @volar/language-service
  │     └── @volar/typescript
  │
  └── @volar/vscode
        └── @volar/language-server
```

## Core Concepts

### VirtualCode

`VirtualCode` represents generated code that is derived from source files. For example, a Vue template might generate TypeScript code for type checking. VirtualCode includes:

- **id**: Unique identifier for the virtual code
- **languageId**: The language of the generated code (e.g., "typescript")
- **snapshot**: The actual code content as an `IScriptSnapshot`
- **mappings**: Source mappings that connect positions in the virtual code back to the source
- **embeddedCodes**: Nested virtual codes (e.g., a TypeScript file might contain embedded CSS)

### SourceScript

`SourceScript` represents an original source file in the system:

- **id**: Unique identifier (typically a URI)
- **languageId**: The language of the source file
- **snapshot**: The file content
- **generated**: The root `VirtualCode` created from this source (if any)
- **associatedIds**: Set of related source scripts
- **targetIds**: Set of source scripts that depend on this one

### LanguagePlugin

A `LanguagePlugin` transforms source files into `VirtualCode`. It provides:

- `getLanguageId()`: Identifies the language of a file
- `createVirtualCode()`: Generates virtual code from a source file
- `updateVirtualCode()`: Incrementally updates virtual code when source changes
- `disposeVirtualCode()`: Cleans up resources

### LanguageServicePlugin

A `LanguageServicePlugin` provides language service features (completion, hover, diagnostics, etc.). It:

- Declares capabilities (which features it provides)
- Implements feature providers (functions that provide the features)
- Can inject dependencies to other plugins
- Can execute commands

### Mapper

A `Mapper` translates positions between source code and virtual code. It provides methods to:

- Map from virtual code positions to source positions
- Map from source positions to virtual code positions
- Filter mappings based on `CodeInformation` flags

### CodeInformation

`CodeInformation` controls which language features are enabled for a specific code region:

- **verification**: Enables diagnostics and code actions
- **completion**: Enables code completion and signature help
- **semantic**: Enables hover, inlay hints, semantic tokens
- **navigation**: Enables go-to-definition, references, rename
- **structure**: Enables document symbols, folding ranges
- **format**: Enables formatting

## Data Flow

### Source File to VirtualCode Flow

```
1. Source File (e.g., example.vue)
   │
   ├─> SourceScript created
   │   ├─ id: URI("file:///example.vue")
   │   ├─ languageId: "vue"
   │   └─ snapshot: file content
   │
   ├─> LanguagePlugin.createVirtualCode() called
   │   │
   │   └─> VirtualCode created
   │       ├─ id: "template"
   │       ├─ languageId: "typescript"
   │       ├─ snapshot: generated TS code
   │       ├─ mappings: [
   │       │     {
   │       │       sourceOffsets: [0, 10, 20],
   │       │       generatedOffsets: [0, 15, 30],
   │       │       lengths: [10, 10, 5],
   │       │       data: { verification: true, navigation: true }
   │       │     }
   │       │   ]
   │       └─ embeddedCodes: [
   │             VirtualCode (CSS),
   │             VirtualCode (HTML)
   │           ]
   │
   └─> SourceScript.generated.root = VirtualCode
```

### Language Service Request Flow

```
1. User Request (e.g., "get completions at position X")
   │
   ├─> LanguageService.getCompletionItems(uri, position)
   │   │
   │   ├─> Get SourceScript for URI
   │   │   └─> language.scripts.get(uri)
   │   │
   │   ├─> Get VirtualCode
   │   │   └─> sourceScript.generated.root
   │   │
   │   ├─> Map position to VirtualCode
   │   │   └─> mapper.toGeneratedLocation(sourcePosition)
   │   │
   │   ├─> Iterate LanguageServicePlugins
   │   │   └─> For each plugin with completionProvider capability:
   │   │       ├─> Check if plugin provides completion
   │   │       ├─> Get virtual document
   │   │       ├─> Call plugin.provide.provideCompletionItems()
   │   │       └─> Map results back to source positions
   │   │
   │   └─> Return merged completion items
```

### LSP Request Flow

```
1. LSP Client Request (e.g., textDocument/completion)
   │
   ├─> Language Server receives request
   │   └─> @volar/language-server
   │
   ├─> Server routes to feature handler
   │   └─> languageFeatures.completion()
   │
   ├─> Get LanguageService for document
   │   └─> project.getLanguageService(uri)
   │
   ├─> Call LanguageService method
   │   └─> languageService.getCompletionItems()
   │
   └─> Map response back to LSP format
       └─> Return to client
```

## Plugin System

### LanguagePlugin Lifecycle

1. **Registration**: Plugins are registered when creating a `Language` instance
2. **File Detection**: `getLanguageId()` is called to identify file types
3. **VirtualCode Creation**: `createVirtualCode()` is called when a file is opened/updated
4. **Incremental Updates**: `updateVirtualCode()` is called on file changes (if implemented)
5. **Cleanup**: `disposeVirtualCode()` is called when a file is closed

### LanguageServicePlugin Lifecycle

1. **Registration**: Plugins are registered when creating a `LanguageService`
2. **Capability Declaration**: Plugin declares which features it provides
3. **Context Creation**: `create(context)` is called to create plugin instance
4. **Feature Provision**: Feature providers are called on-demand
5. **Dependency Injection**: Plugins can inject dependencies to other plugins

### Plugin Execution Order

LanguageServicePlugins are executed in registration order. The first plugin to return a result typically wins, though some features support merging results from multiple plugins.

## Mapping System

### Mapping Structure

A mapping connects positions in source code to positions in virtual code:

```typescript
Mapping {
  source: string | undefined,           // Source file URI
  sourceOffsets: number[],              // Positions in source
  generatedOffsets: number[],           // Positions in virtual code
  lengths: number[],                     // Lengths of mapped regions
  generatedLengths?: number[],           // Lengths in virtual code (if different)
  data: CodeInformation                  // Feature flags
}
```

### Mapping Operations

1. **toSourceLocation**: Maps a virtual code offset to source offsets
2. **toGeneratedLocation**: Maps a source offset to virtual code offsets
3. **toSourceRange**: Maps a virtual code range to source ranges
4. **toGeneratedRange**: Maps a source range to virtual code ranges

### Mapping Caching

Mappings are cached using WeakMaps keyed by snapshots to avoid recomputation:

- `virtualCode.snapshot` → `WeakMap<sourceScript.snapshot, Mapper>`
- This ensures mappings are recomputed only when snapshots change

## Language Service Features

Volar.js provides 30+ language service features organized by category:

### Completion & IntelliSense

- Code completion (`getCompletionItems`)
- Signature help (`getSignatureHelp`)
- Auto-insert snippets (`getAutoInsertSnippet`)

### Navigation

- Go to definition (`getDefinition`)
- Go to type definition (`getTypeDefinition`)
- Find references (`getReferences`)
- Go to implementation (`getImplementations`)
- Workspace symbols (`getWorkspaceSymbols`)

### Semantic Information

- Hover (`getHover`)
- Document highlights (`getDocumentHighlights`)
- Semantic tokens (`getSemanticTokens`)
- Inlay hints (`getInlayHints`)
- Code lenses (`getCodeLenses`)

### Diagnostics & Actions

- Diagnostics (`getDiagnostics`, `getWorkspaceDiagnostics`)
- Code actions (`getCodeActions`)

### Editing Support

- Formatting (`getDocumentFormattingEdits`)
- Rename (`getRenameEdits`, `getRenameRange`)
- File rename (`getFileRenameEdits`)
- Document drop edits (`getDocumentDropEdits`)

### Structure

- Document symbols (`getDocumentSymbols`)
- Folding ranges (`getFoldingRanges`)
- Selection ranges (`getSelectionRanges`)
- Linked editing ranges (`getLinkedEditingRanges`)

### Other Features

- Document colors (`getDocumentColors`, `getColorPresentations`)
- Document links (`getDocumentLinks`)
- Call hierarchy (`getCallHierarchyItems`)
- Type hierarchy
- Moniker
- Inline values

## Performance Considerations

### Incremental Updates

- `updateVirtualCode()` allows plugins to incrementally update virtual code instead of recreating it
- Only changed regions are reprocessed when possible

### Caching Strategy

- VirtualCode snapshots are cached per SourceScript
- Mappers are cached per snapshot pair
- Document versions are tracked to avoid unnecessary updates

### Lazy Evaluation

- VirtualCode is only created when needed
- Language service features are computed on-demand
- File system access is deferred until required

## Extension Points

### Creating a LanguagePlugin

Implement the `LanguagePlugin` interface to add support for a new file type:

```typescript
const myPlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    if (uri.fsPath.endsWith(".myext")) return "my-lang";
  },
  createVirtualCode(uri, languageId, snapshot, ctx) {
    // Generate virtual code
    return {
      id: "main",
      languageId: "typescript",
      snapshot: createSnapshot(generatedCode),
      mappings: createMappings(sourceCode, generatedCode),
    };
  },
};
```

### Creating a LanguageServicePlugin

Implement the `LanguageServicePlugin` interface to add language features:

```typescript
const myServicePlugin: LanguageServicePlugin = {
  name: "my-plugin",
  capabilities: {
    hoverProvider: true,
    completionProvider: {
      triggerCharacters: ["."],
    },
  },
  create(context) {
    return {
      provide: {
        provideHover(document, position) {
          // Provide hover information
        },
        provideCompletionItems(document, position) {
          // Provide completions
        },
      },
    };
  },
};
```

For more details on creating plugins, see [docs/PLUGINS.md](PLUGINS.md).
