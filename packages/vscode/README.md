# @volar/vscode

VS Code extension client for Volar.js language servers. Provides LSP client implementation and VS Code API integration.

## Overview

`@volar/vscode` provides:

- **LSP Client**: Language client implementation for VS Code
- **VS Code Integration**: VS Code API integration and middleware
- **Protocol Extensions**: Custom protocol requests and notifications
- **Feature Activators**: Helpers for activating language features

## Installation

```bash
npm install @volar/vscode
```

## Core Concepts

### LanguageClient

The LSP client that communicates with the language server. Uses `vscode-languageclient` under the hood.

### Middleware

Custom middleware for transforming requests and responses between VS Code and the language server.

### Protocol Extensions

Custom protocol requests and notifications beyond standard LSP.

## API Reference

### Middleware

Pre-configured middleware for handling VS Code-specific transformations:

```typescript
import { middleware } from "@volar/vscode";

const client = new LanguageClient({
  // ... options
  middleware: {
    ...middleware,
    // Your custom middleware
  },
});
```

The middleware handles:

- Code action command parsing
- Code lens command parsing
- Reference command parsing
- Rename command parsing

### Feature Activators

#### activateAutoInsertion

Activates auto-insertion feature (e.g., closing tags).

```typescript
import { activateAutoInsertion } from '@volar/vscode';

activateAutoInsertion(
  client: LanguageClient,
  documentSelector: DocumentSelector
): Disposable
```

#### activateDocumentDropEdit

Activates document drop edit feature.

```typescript
import { activateDocumentDropEdit } from '@volar/vscode';

activateDocumentDropEdit(
  client: LanguageClient,
  documentSelector: DocumentSelector
): Disposable
```

#### activateFindFileReferences

Activates find file references feature.

```typescript
import { activateFindFileReferences } from '@volar/vscode';

activateFindFileReferences(
  client: LanguageClient,
  documentSelector: DocumentSelector
): Disposable
```

#### activateReloadProjects

Activates project reload feature.

```typescript
import { activateReloadProjects } from '@volar/vscode';

activateReloadProjects(
  client: LanguageClient,
  documentSelector: DocumentSelector
): Disposable
```

#### activateTsConfigStatusItem

Activates TypeScript config status item.

```typescript
import { activateTsConfigStatusItem } from '@volar/vscode';

activateTsConfigStatusItem(
  client: LanguageClient,
  documentSelector: DocumentSelector
): Disposable
```

#### activateTsVersionStatusItem

Activates TypeScript version status item.

```typescript
import { activateTsVersionStatusItem, getTsdk } from '@volar/vscode';

activateTsVersionStatusItem(
  client: LanguageClient,
  documentSelector: DocumentSelector
): Disposable

// Get TypeScript SDK path
const tsdk = await getTsdk(context);
```

### Protocol Extensions

Custom protocol requests:

#### FindFileReferenceRequest

Finds all references to a file.

```typescript
import { FindFileReferenceRequest } from "@volar/vscode/protocol";

const references = await client.sendRequest(FindFileReferenceRequest.type, {
  textDocument: { uri: document.uri.toString() },
});
```

#### GetMatchTsConfigRequest

Gets the matching tsconfig.json for a document.

```typescript
import { GetMatchTsConfigRequest } from "@volar/vscode/protocol";

const tsconfig = await client.sendRequest(GetMatchTsConfigRequest.type, {
  uri: document.uri.toString(),
});
```

#### AutoInsertRequest

Requests auto-insert snippet.

```typescript
import { AutoInsertRequest } from "@volar/vscode/protocol";

const snippet = await client.sendRequest(AutoInsertRequest.type, {
  textDocument: { uri: document.uri.toString() },
  selection: position,
  change: { rangeOffset, rangeLength, text },
});
```

#### ReloadProjectNotification

Notifies server to reload project.

```typescript
import { ReloadProjectNotification } from "@volar/vscode/protocol";

client.sendNotification(ReloadProjectNotification.type, {
  uri: document.uri.toString(),
});
```

### Labs Integration

For Volar Labs extension integration:

```typescript
import { createLabsInfo } from "@volar/vscode";

const { extensionExports, addLanguageClient } = createLabsInfo();

// Add language client when created
addLanguageClient(client);

// Export for Labs extension
export function activate(context: ExtensionContext) {
  return extensionExports;
}
```

## Complete Example

### Basic VS Code Extension

```typescript
import * as vscode from "vscode";
import {
  LanguageClient,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";
import { middleware, activateAutoInsertion } from "@volar/vscode";

export function activate(context: vscode.ExtensionContext) {
  // Server options
  const serverModule = context.asAbsolutePath("server.js");
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };

  // Client options
  const clientOptions = {
    documentSelector: [{ scheme: "file", language: "typescript" }],
    middleware,
  };

  // Create client
  const client = new LanguageClient(
    "myLanguageServer",
    "My Language Server",
    serverOptions,
    clientOptions
  );

  // Start client
  client.start();

  // Activate features
  context.subscriptions.push(
    activateAutoInsertion(client, clientOptions.documentSelector)
  );

  context.subscriptions.push(client);
}
```

### With Protocol Extensions

```typescript
import { FindFileReferenceRequest } from "@volar/vscode/protocol";

// Register command that uses custom protocol
vscode.commands.registerCommand("myExtension.findFileReferences", async () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const references = await client.sendRequest(FindFileReferenceRequest.type, {
    textDocument: { uri: editor.document.uri.toString() },
  });

  if (references) {
    // Show references
  }
});
```

## Related Documentation

- [VS Code Extension API](https://code.visualstudio.com/api)
- [vscode-languageclient](https://www.npmjs.com/package/vscode-languageclient)
- [@volar/language-server](../language-server/README.md) - Language server implementation

## See Also

- [@volar/language-service](../language-service/README.md) - Language service features
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
