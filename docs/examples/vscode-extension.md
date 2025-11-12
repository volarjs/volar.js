# VS Code Extension

Complete guide to creating a VS Code extension using Volar.js.

## Overview

This guide shows how to create a VS Code extension that uses Volar.js language server.

## Step 1: Extension Structure

```
my-extension/
  package.json
  src/
    extension.ts
    server.ts
```

## Step 2: package.json

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "engines": {
    "vscode": "^1.82.0"
  },
  "activationEvents": ["onLanguage:my-lang"],
  "contributes": {
    "languages": [
      {
        "id": "my-lang",
        "extensions": [".myext"]
      }
    ]
  }
}
```

## Step 3: Server Implementation

Create `src/server.ts`:

```typescript
import { createServerBase, createSimpleProject } from "@volar/language-server";
import { createConnection } from "vscode-languageserver/node";
import { myLanguagePlugin } from "./language-plugin";
import { myServicePlugin } from "./service-plugin";

const connection = createConnection();
const server = createServerBase(connection, {});
const project = createSimpleProject([myLanguagePlugin]);

connection.onInitialize((params) => {
  return server.initialize(params, project, [myServicePlugin]);
});

connection.onInitialized(() => {
  server.initialized();
});

connection.listen();
```

## Step 4: Client Implementation

Create `src/extension.ts`:

```typescript
import * as vscode from "vscode";
import {
  LanguageClient,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";
import { middleware, activateAutoInsertion } from "@volar/vscode";

export function activate(context: vscode.ExtensionContext) {
  const serverModule = context.asAbsolutePath("dist/server.js");

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };

  const clientOptions = {
    documentSelector: [{ scheme: "file", language: "my-lang" }],
    middleware,
  };

  const client = new LanguageClient(
    "myLanguageServer",
    "My Language Server",
    serverOptions,
    clientOptions
  );

  client.start();

  context.subscriptions.push(
    activateAutoInsertion(client, clientOptions.documentSelector)
  );

  context.subscriptions.push(client);
}
```

## Step 5: Build Configuration

Add build scripts to `package.json`:

```json
{
  "scripts": {
    "compile": "tsc -b",
    "watch": "tsc -b -w"
  }
}
```

## Complete Example

See the [VS Code package README](../../packages/vscode/README.md) for more details.

## Related Documentation

- [@volar/vscode](../../packages/vscode/README.md) - VS Code package documentation
- [VS Code Extension API](https://code.visualstudio.com/api) - VS Code API documentation
