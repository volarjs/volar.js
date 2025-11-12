# Package Overviews

Concise summaries of each Volar.js package, their purpose, key exports, use cases, and relationships.

## Core Packages

### @volar/language-core

**Purpose**: Foundation for language processing. Manages virtual code generation and source-to-virtual code mapping.

**Key Exports**:

- `createLanguage()` - Creates a language instance
- `LanguagePlugin` - Interface for language plugins
- `VirtualCode` - Generated code representation
- `SourceScript` - Source file representation
- `Mapper` - Position mapping between source and virtual code

**Use Cases**:

- Creating language plugins
- Managing virtual code generation
- Handling source code transformations

**Dependencies**: `@volar/source-map`

**Used By**: `@volar/language-service`, `@volar/language-server`, `@volar/typescript`, `@volar/kit`, `@volar/monaco`, `@volar/eslint`

---

### @volar/language-service

**Purpose**: Provides language service features (completion, hover, diagnostics, etc.) built on top of language-core.

**Key Exports**:

- `createLanguageService()` - Creates a language service instance
- `LanguageServicePlugin` - Interface for service plugins
- 30+ feature methods (getCompletionItems, getHover, getDiagnostics, etc.)

**Use Cases**:

- Building language servers
- Creating language service plugins
- Providing IDE features

**Dependencies**: `@volar/language-core`

**Used By**: `@volar/language-server`, `@volar/kit`, `@volar/monaco`

---

### @volar/language-server

**Purpose**: Implements Language Server Protocol (LSP) server.

**Key Exports**:

- `createServerBase()` - Creates server base
- `createTypeScriptProject()` - Creates TypeScript project
- `createSimpleProject()` - Creates simple project

**Use Cases**:

- Building LSP servers
- Creating VS Code extensions
- Integrating with editors

**Dependencies**: `@volar/language-core`, `@volar/language-service`, `@volar/typescript`

**Used By**: `@volar/vscode`

---

## Integration Packages

### @volar/vscode

**Purpose**: VS Code extension client for LSP.

**Key Exports**:

- `middleware` - VS Code middleware
- `activateAutoInsertion()` - Auto-insertion feature
- `activateDocumentDropEdit()` - Document drop feature
- Protocol extensions

**Use Cases**:

- Creating VS Code extensions
- Integrating language servers with VS Code

**Dependencies**: `@volar/language-server`

---

### @volar/monaco

**Purpose**: Monaco Editor integration.

**Key Exports**:

- `createSimpleWorkerLanguageService()` - Simple worker service
- `createTypeScriptWorkerLanguageService()` - TypeScript worker service
- `activateMarkers()` - Diagnostic markers
- `registerProviders()` - Language feature providers

**Use Cases**:

- Integrating with Monaco Editor
- Building web-based IDEs
- Browser-based language services

**Dependencies**: `@volar/language-service`, `@volar/typescript`

---

### @volar/kit

**Purpose**: Node.js application toolkit.

**Key Exports**:

- `createTypeScriptChecker()` - TypeScript checker
- `createTypeScriptInferredChecker()` - Inferred checker
- `createFormatter()` - Code formatter

**Use Cases**:

- Building CLI tools
- Linting and formatting
- Node.js applications

**Dependencies**: `@volar/language-service`, `@volar/typescript`

---

## Supporting Packages

### @volar/typescript

**Purpose**: TypeScript integration utilities.

**Key Exports**:

- `TypeScriptServiceScript` - Service script interface
- `decorateLanguageServiceHost()` - Decorate TS host
- `decorateProgram()` - Decorate TS program
- `proxyLanguageService()` - Proxy TS language service

**Use Cases**:

- Integrating TypeScript support
- Creating TypeScript language plugins
- TypeScript program decoration

**Dependencies**: `@volar/language-core`

**Used By**: `@volar/language-server`, `@volar/kit`, `@volar/monaco`

---

### @volar/source-map

**Purpose**: Source mapping functionality.

**Key Exports**:

- `SourceMap` - Source map class
- `Mapping` - Mapping type

**Use Cases**:

- Mapping positions between source and generated code
- Translating diagnostics and ranges

**Dependencies**: None

**Used By**: `@volar/language-core`

---

### @volar/test-utils

**Purpose**: Testing utilities for language servers.

**Key Exports**:

- `startLanguageServer()` - Start test server
- `printSnapshots()` - Print virtual code snapshots

**Use Cases**:

- Testing language servers
- Integration testing
- Debugging virtual code

**Dependencies**: `@volar/language-core`, `@volar/language-server`

---

### @volar/eslint

**Purpose**: ESLint integration.

**Key Exports**:

- `createProcessor()` - ESLint processor

**Use Cases**:

- Integrating with ESLint
- Linting virtual code

**Dependencies**: `@volar/language-core`

---

### @volar/jsdelivr

**Purpose**: jsDelivr CDN integration for Auto Type Acquisition.

**Key Exports**:

- `createNpmFileSystem()` - NPM file system

**Use Cases**:

- Auto Type Acquisition (ATA)
- Browser-based type resolution
- CDN-based package access

**Dependencies**: None

**Used By**: `@volar/monaco` (for ATA)

---

## Package Relationships

```
@volar/source-map
    ↑
@volar/language-core
    ↑
    ├── @volar/language-service
    │       ↑
    │       ├── @volar/language-server
    │       │       ↑
    │       │       └── @volar/vscode
    │       │
    │       ├── @volar/kit
    │       └── @volar/monaco
    │
    ├── @volar/typescript
    │       ↑
    │       ├── @volar/language-server
    │       ├── @volar/kit
    │       └── @volar/monaco
    │
    └── @volar/eslint

@volar/jsdelivr (standalone, used by @volar/monaco)
@volar/test-utils (testing, depends on core packages)
```

## When to Use Each Package

- **@volar/language-core**: Creating language plugins, virtual code generation
- **@volar/language-service**: Building language services, creating service plugins
- **@volar/language-server**: Building LSP servers
- **@volar/vscode**: Creating VS Code extensions
- **@volar/monaco**: Integrating with Monaco Editor
- **@volar/kit**: Node.js applications, CLI tools
- **@volar/typescript**: TypeScript integration
- **@volar/source-map**: Position mapping utilities
- **@volar/test-utils**: Testing language servers
- **@volar/eslint**: ESLint integration
- **@volar/jsdelivr**: Browser-based ATA
