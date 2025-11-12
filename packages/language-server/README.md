# @volar/language-server

Implements a Language Server Protocol (LSP) server that provides language services to LSP clients like VS Code, Neovim, and other editors.

## Overview

`@volar/language-server` provides:

- **LSP Server Implementation**: Complete LSP protocol handling
- **Project Management**: TypeScript and Simple project types
- **File System Providers**: Node.js and HTTP file system support
- **Server Lifecycle**: Initialization, configuration, and shutdown handling
- **Feature Handlers**: All LSP language features

## Installation

```bash
npm install @volar/language-server
```

## Core Concepts

### LanguageServer

The main server instance that handles LSP communication and manages projects.

### LanguageServerProject

Manages language services for a workspace. Two types are available:

- **TypeScriptProject**: For TypeScript/JavaScript projects with tsconfig.json
- **SimpleProject**: For simple projects without TypeScript configuration

### File System Providers

Abstractions for file system access:

- **NodeFileSystem**: Node.js file system (default)
- **HttpFileSystem**: HTTP-based file system for browser environments

## API Reference

### createServerBase

Creates a base server instance.

```typescript
function createServerBase(
  connection: Connection,
  env: LanguageServerEnvironment
): LanguageServerBase;
```

**Parameters:**

- `connection`: LSP connection (from `vscode-languageserver`)
- `env`: Server environment configuration

**Returns:** A server base instance

**Example:**

```typescript
import { createServerBase } from "@volar/language-server";
import { createConnection } from "vscode-languageserver/node";

const connection = createConnection();
const server = createServerBase(connection, {
  // Environment configuration
});
```

### Project Creation

#### createTypeScriptProject

Creates a TypeScript project that manages multiple TypeScript projects based on tsconfig.json files.

```typescript
function createTypeScriptProject(
  ts: typeof import("typescript"),
  tsLocalized: ts.MapLike<string> | undefined,
  create: (projectContext: ProjectExposeContext) => ProviderResult<{
    languagePlugins: LanguagePlugin<URI>[];
    setup?: (options: { language: Language; project: ProjectContext }) => void;
  }>
): LanguageServerProject;
```

**Parameters:**

- `ts`: TypeScript instance
- `tsLocalized`: Localized TypeScript messages (optional)
- `create`: Function that creates language plugins for each project

**Example:**

```typescript
import { createTypeScriptProject } from "@volar/language-server";
import ts from "typescript";

const project = createTypeScriptProject(ts, undefined, (projectContext) => {
  return {
    languagePlugins: [
      // Your language plugins
    ],
  };
});
```

#### createSimpleProject

Creates a simple project without TypeScript configuration.

```typescript
function createSimpleProject(
  languagePlugins: LanguagePlugin<URI>[]
): LanguageServerProject;
```

**Parameters:**

- `languagePlugins`: Array of language plugins

**Example:**

```typescript
import { createSimpleProject } from "@volar/language-server";

const project = createSimpleProject([
  // Your language plugins
]);
```

### Server Initialization

```typescript
server.initialize(
  params: InitializeParams,
  project: LanguageServerProject,
  languageServicePlugins: LanguageServicePlugin[]
): InitializeResult
```

**Parameters:**

- `params`: LSP initialize parameters
- `project`: Project instance
- `languageServicePlugins`: Array of language service plugins

**Example:**

```typescript
connection.onInitialize((params) => {
  return server.initialize(params, project, [myServicePlugin]);
});

connection.onInitialized(() => {
  server.initialized();
});
```

## File System Providers

### Node File System

Default file system provider for Node.js environments:

```typescript
import { provider as nodeFileSystem } from "@volar/language-server/lib/fileSystemProviders/node";

const env: LanguageServerEnvironment = {
  fs: nodeFileSystem,
  // ... other options
};
```

### HTTP File System

For browser environments:

```typescript
import { provider as httpFileSystem } from "@volar/language-server/lib/fileSystemProviders/http";

const env: LanguageServerEnvironment = {
  fs: httpFileSystem,
  // ... other options
};
```

## Server Features

The server automatically handles all LSP features:

- **Text Document Synchronization**: DidOpen, DidChange, DidClose
- **Workspace Management**: Workspace folders, configuration
- **Language Features**: All features from `@volar/language-service`
- **File Watching**: File system change notifications
- **Configuration**: Client configuration management

## Complete Example

### Basic Server Setup

```typescript
import { createServerBase, createSimpleProject } from "@volar/language-server";
import { createConnection } from "vscode-languageserver/node";
import { URI } from "vscode-uri";

// Create LSP connection
const connection = createConnection();

// Create server
const server = createServerBase(connection, {
  // Environment configuration
});

// Create project
const project = createSimpleProject([
  // Your language plugins
]);

// Initialize
connection.onInitialize((params) => {
  return server.initialize(params, project, [
    // Your language service plugins
  ]);
});

connection.onInitialized(() => {
  server.initialized();
});

// Listen
connection.listen();
```

### TypeScript Project Setup

```typescript
import {
  createServerBase,
  createTypeScriptProject,
} from "@volar/language-server";
import { createConnection } from "vscode-languageserver/node";
import ts from "typescript";

const connection = createConnection();
const server = createServerBase(connection, {});

const project = createTypeScriptProject(ts, undefined, (projectContext) => {
  return {
    languagePlugins: [
      // Your language plugins
    ],
  };
});

connection.onInitialize((params) => {
  return server.initialize(params, project, [
    // Your language service plugins
  ]);
});

connection.onInitialized(() => {
  server.initialized();
});

connection.listen();
```

## Server Lifecycle

1. **Setup**: Server is created with `createServerBase`
2. **Initialize**: Client sends initialize request, server responds with capabilities
3. **Initialized**: Client sends initialized notification, server sets up project
4. **Running**: Server handles requests and notifications
5. **Shutdown**: Client sends shutdown request, server cleans up
6. **Exit**: Client sends exit notification, server exits

## Project Types

### TypeScriptProject

Manages multiple TypeScript projects:

- Automatically discovers tsconfig.json files
- Creates separate language services for each project
- Handles project references
- Supports inferred projects for files without tsconfig

### SimpleProject

Single project without TypeScript:

- One language service for all files
- No TypeScript configuration needed
- Simpler setup for non-TypeScript languages

## Customization

### Custom File System

```typescript
import type { FileSystem } from "@volar/language-service";

const customFileSystem: FileSystem = {
  stat(uri) {
    // Custom stat implementation
  },
  readFile(uri, encoding) {
    // Custom read file implementation
  },
  readDirectory(uri) {
    // Custom read directory implementation
  },
};

const env: LanguageServerEnvironment = {
  fs: customFileSystem,
  // ... other options
};
```

### Custom URI Converter

```typescript
const uriConverter = {
  asUri(fileName: string): URI {
    return URI.file(fileName);
  },
  asFileName(uri: URI): string {
    return uri.fsPath;
  },
};
```

## Related Documentation

- [Architecture Guide](../../docs/ARCHITECTURE.md) - System architecture
- [@volar/language-service](../language-service/README.md) - Language service features
- [@volar/vscode](../vscode/README.md) - VS Code client

## See Also

- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/)
- [vscode-languageserver](https://www.npmjs.com/package/vscode-languageserver) - LSP library
