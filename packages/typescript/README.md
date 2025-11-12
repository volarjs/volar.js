# @volar/typescript

TypeScript integration utilities for Volar.js. Provides TypeScript language plugin support, service script system, and program decoration.

## Overview

`@volar/typescript` provides:

- **TypeScript Language Plugin Support**: Integrate TypeScript into language plugins
- **Service Script System**: Convert virtual code to TypeScript service scripts
- **Program Decoration**: Decorate TypeScript programs and language service hosts
- **Protocol Integration**: TypeScript protocol support

## Installation

```bash
npm install @volar/typescript
```

## Core Concepts

### TypeScriptServiceScript

Represents a virtual code that can be used as a TypeScript service script:

```typescript
interface TypeScriptServiceScript {
  code: VirtualCode;
  extension:
    | ".ts"
    | ".js"
    | ".mts"
    | ".mjs"
    | ".cjs"
    | ".cts"
    | ".d.ts"
    | string;
  scriptKind: ts.ScriptKind;
  preventLeadingOffset?: boolean;
}
```

### TypeScriptExtraServiceScript

Additional service script with a specific file name:

```typescript
interface TypeScriptExtraServiceScript extends TypeScriptServiceScript {
  fileName: string;
}
```

### LanguagePlugin.typescript

TypeScript-specific options for language plugins:

```typescript
interface TypeScriptGenericOptions {
  extraFileExtensions: ts.FileExtensionInfo[];
  resolveHiddenExtensions?: boolean;
  getServiceScript(root: VirtualCode): TypeScriptServiceScript | undefined;
}

interface TypeScriptNonTSPluginOptions {
  getExtraServiceScripts?(
    fileName: string,
    root: VirtualCode
  ): TypeScriptExtraServiceScript[];
  resolveLanguageServiceHost?(
    host: ts.LanguageServiceHost
  ): ts.LanguageServiceHost;
}
```

## API Reference

### decorateLanguageServiceHost

Decorates a TypeScript language service host to support virtual code.

```typescript
function decorateLanguageServiceHost(
  host: ts.LanguageServiceHost
  // ... options
): ts.LanguageServiceHost;
```

### decorateProgram

Decorates a TypeScript program to support virtual code.

```typescript
function decorateProgram(
  program: ts.Program
  // ... options
): ts.Program;
```

### proxyCreateProgram

Creates a proxy for `ts.createProgram` that supports virtual code.

```typescript
function proxyCreateProgram(
  createProgram: typeof ts.createProgram
  // ... options
): typeof ts.createProgram;
```

### proxyLanguageService

Creates a proxy for TypeScript language service that supports virtual code.

```typescript
function proxyLanguageService(
  createLanguageService: typeof ts.createLanguageService
  // ... options
): typeof ts.createLanguageService;
```

### createProject

Creates a TypeScript project with virtual code support.

```typescript
function createProject(): Project;
// ... options
```

### createSys

Creates a TypeScript system with virtual code support.

```typescript
function createSys(): ts.System;
// ... options
```

## Usage Examples

### Creating a TypeScript Language Plugin

```typescript
import type { LanguagePlugin, VirtualCode } from "@volar/language-core";
import type { TypeScriptServiceScript } from "@volar/typescript";
import ts from "typescript";

const myPlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    if (uri.fsPath.endsWith(".vue")) return "vue";
  },

  createVirtualCode(uri, languageId, snapshot, ctx) {
    // Generate TypeScript virtual code
    const tsCode = generateTypeScript(snapshot);

    return {
      id: "script",
      languageId: "typescript",
      snapshot: createSnapshot(tsCode),
      mappings: createMappings(snapshot, tsCode),
    };
  },

  typescript: {
    extraFileExtensions: [
      { extension: ".vue", isMixedContent: true, scriptKind: ts.ScriptKind.TS },
    ],
    getServiceScript(root: VirtualCode): TypeScriptServiceScript | undefined {
      if (root.languageId === "typescript") {
        return {
          code: root,
          extension: ".ts",
          scriptKind: ts.ScriptKind.TS,
        };
      }
    },
  },
};
```

### Using Program Decoration

```typescript
import { decorateProgram } from "@volar/typescript";
import ts from "typescript";

const program = ts.createProgram(fileNames, options, host);
const decoratedProgram = decorateProgram(program, {
  // Decoration options
});
```

### Using Language Service Proxy

```typescript
import { proxyLanguageService } from "@volar/typescript";
import ts from "typescript";

const createLanguageService = proxyLanguageService(ts.createLanguageService, {
  // Proxy options
});

const languageService = createLanguageService(host);
```

## Related Documentation

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [@volar/language-core](../language-core/README.md) - Core language processing
- [@volar/language-service](../language-service/README.md) - Language service features

## See Also

- [@volar/language-server](../language-server/README.md) - LSP server with TypeScript support
