# Monaco Editor Integration

Complete guide to integrating Volar.js with Monaco Editor.

## Overview

This guide shows how to set up Volar.js with Monaco Editor, including worker setup, language registration, and feature activation.

## Step 1: Create Worker File

Create `my-lang.worker.ts`:

```typescript
import * as worker from "monaco-editor-core/esm/vs/editor/editor.worker";
import type * as monaco from "monaco-editor-core";
import type { LanguageServiceEnvironment } from "@volar/language-service";
import { createSimpleWorkerLanguageService } from "@volar/monaco/worker";
import { URI } from "vscode-uri";

self.onmessage = () => {
  worker.initialize((ctx: monaco.worker.IWorkerContext) => {
    const env: LanguageServiceEnvironment = {
      workspaceFolders: [URI.parse("file:///")],
    };

    return createSimpleWorkerLanguageService({
      workerContext: ctx,
      env,
      languagePlugins: [
        // Your language plugins
        myLanguagePlugin,
      ],
      languageServicePlugins: [
        // Your service plugins
        myServicePlugin,
      ],
    });
  });
};
```

## Step 2: Configure Worker Loader

In your main application:

```typescript
import editorWorker from "monaco-editor-core/esm/vs/editor/editor.worker?worker";
import myWorker from "./my-lang.worker?worker";

(self as any).MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === "my-lang") {
      return new myWorker();
    }
    return new editorWorker();
  },
};
```

## Step 3: Register Language

```typescript
import { languages } from "monaco-editor-core";

languages.register({
  id: "my-lang",
  extensions: [".myext"],
});
```

## Step 4: Activate Language Features

```typescript
import { editor, languages, Uri } from "monaco-editor-core";
import {
  activateMarkers,
  activateAutoInsertion,
  registerProviders,
} from "@volar/monaco";
import type { WorkerLanguageService } from "@volar/monaco/worker";

languages.onLanguage("my-lang", () => {
  const worker = editor.createWebWorker<WorkerLanguageService>({
    moduleId: "vs/language/my-lang/myLangWorker",
    label: "my-lang",
  });

  // Activate diagnostics
  activateMarkers(
    worker,
    ["my-lang"],
    "my-lang-markers",
    () => {
      // Return URIs to sync
      return editor
        .getModels()
        .map((model) => model.uri)
        .filter((uri) => uri.scheme === "file");
    },
    editor
  );

  // Activate auto-insertion
  activateAutoInsertion(
    worker,
    ["my-lang"],
    () => editor.getModels().map((model) => model.uri),
    editor
  );

  // Register language providers
  registerProviders(
    worker,
    ["my-lang"],
    () => editor.getModels().map((model) => model.uri),
    languages
  );
});
```

## Step 5: Create Editor Instance

```typescript
import { editor } from "monaco-editor-core";

const monacoEditor = editor.create(document.getElementById("editor"), {
  value: "// Your code here",
  language: "my-lang",
});
```

## TypeScript Support

For TypeScript support, use `createTypeScriptWorkerLanguageService`:

```typescript
import { createTypeScriptWorkerLanguageService } from "@volar/monaco/worker";
import { create as createTypeScriptServicePlugin } from "volar-service-typescript";
import ts from "typescript";

self.onmessage = () => {
  worker.initialize((ctx) => {
    return createTypeScriptWorkerLanguageService({
      typescript: ts,
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
      },
      uriConverter: {
        asFileName: (uri) => uri.fsPath,
        asUri: (fileName) => URI.file(fileName),
      },
      workerContext: ctx,
      env: { workspaceFolders: [URI.parse("file:///")] },
      languagePlugins: [myLanguagePlugin],
      languageServicePlugins: [...createTypeScriptServicePlugin(ts)],
    });
  });
};
```

## Auto Type Acquisition (ATA)

Enable ATA for automatic type definition fetching:

```typescript
import { createNpmFileSystem } from "@volar/jsdelivr";

const env: LanguageServiceEnvironment = {
  workspaceFolders: [URI.parse("file:///")],
  fs: createNpmFileSystem(), // Enable ATA
};
```

## Complete Example

See the [Monaco README](../../packages/monaco/README.md) for complete examples.

## Related Documentation

- [@volar/monaco](../../packages/monaco/README.md) - Monaco package documentation
- [Monaco Editor Docs](https://microsoft.github.io/monaco-editor/) - Monaco Editor documentation
