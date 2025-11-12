# @volar/monaco

`@volar/monaco` is used to bridge the language capabilities implemented based on Volar.js to Monaco Editor, you can expect:

- Support IntelliSense, Diagnosis, Formatting
- Language behavior is consistent with regular IDEs
- Optimized Performance
- Missing package types are automatically fetched from CDN

It should be noted that this package does not participate in syntax highlighting support and language configuration.

We assume you already know:

- How to create a Monaco Editor
- How to work with Web Worker

## Usage

### Setup worker

```ts
// my-lang.worker.ts
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
        // ...
      ],
      languageServicePlugins: [
        // ...
      ],
    });
  });
};
```

#### Add TypeScript Support

```diff
import * as worker from 'monaco-editor-core/esm/vs/editor/editor.worker';
import type * as monaco from 'monaco-editor-core';
import type { LanguageServiceEnvironment } from '@volar/language-service';
-import { createSimpleWorkerLanguageService } from '@volar/monaco/worker';
+import { createTypeScriptWorkerLanguageService } from '@volar/monaco/worker';
import { URI } from 'vscode-uri';
+import { create as createTypeScriptServicePlugin } from 'volar-service-typescript';
+import ts from 'typescript';

self.onmessage = () => {
	worker.initialize((ctx: monaco.worker.IWorkerContext) => {
		const env: LanguageServiceEnvironment = {
			workspaceFolders: [
				URI.parse('file:///'),
			],
		};
-		return createSimpleWorkerLanguageService({
+		return createTypeScriptWorkerLanguageService({
+			typescript: ts,
+			compilerOptions: {
+				// ...
+			},
+			uriConverter: {
+				asFileName: uri => uri.fsPath,
+				asUri: fileName => URI.file(fileName),
+			},
			workerContext: ctx,
			env,
			languagePlugins: [
				// ...
			],
			languageServicePlugins: [
				// ...
+				...createTypeScriptServicePlugin(ts),
			],
		});
	});
};
```

#### Add ATA Support for TypeScript

```diff
import * as worker from 'monaco-editor-core/esm/vs/editor/editor.worker';
import type * as monaco from 'monaco-editor-core';
import type { LanguageServiceEnvironment } from '@volar/language-service';
import { createTypeScriptWorkerLanguageService } from '@volar/monaco/worker';
import { URI } from 'vscode-uri';
+import { createNpmFileSystem } from '@volar/jsdelivr';
import { create as createTypeScriptServicePlugin } from 'volar-service-typescript';
import ts from 'typescript';

self.onmessage = () => {
	worker.initialize((ctx: monaco.worker.IWorkerContext) => {
		const env: LanguageServiceEnvironment = {
			workspaceFolders: [
				URI.parse('file:///'),
			],
		};
+		env.fs = createNpmFileSystem();
		return createTypeScriptWorkerLanguageService({
			typescript: ts,
			compilerOptions: {
				// ...
			},
			uriConverter: {
				asFileName: uri => uri.fsPath,
				asUri: fileName => URI.file(fileName),
			},
			workerContext: ctx,
			env,
			languagePlugins: [
				// ...
			],
			languageServicePlugins: [
				// ...
				createTypeScriptServicePlugin(ts),
			],
		});
	});
};
```

### Add worker loader to global env

```ts
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

### Setup Language Features and Diagnostics

```ts
import type { WorkerLanguageService } from "@volar/monaco/worker";
import { editor, languages, Uri } from "monaco-editor-core";
import {
  activateMarkers,
  activateAutoInsertion,
  registerProviders,
} from "@volar/monaco";

languages.register({ id: "my-lang", extensions: [".my-lang"] });

languages.onLanguage("my-lang", () => {
  const worker = editor.createWebWorker<WorkerLanguageService>({
    moduleId: "vs/language/my-lang/myLangWorker",
    label: "my-lang",
  });
  activateMarkers(
    worker,
    ["my-lang"],
    "my-lang-markers-owner",
    // sync files
    () => [Uri.file("/Foo.my-lang"), Uri.file("/Bar.my-lang")],
    editor
  );
  // auto close tags
  activateAutoInsertion(
    worker,
    ["my-lang"],
    // sync files
    () => [Uri.file("/Foo.my-lang"), Uri.file("/Bar.my-lang")],
    editor
  );
  registerProviders(
    worker,
    ["my-lang"],
    // sync files
    () => [Uri.file("/Foo.my-lang"), Uri.file("/Bar.my-lang")],
    languages
  );
});
```

## Worker Patterns

### Worker Lifecycle

Workers are created on-demand when a language is activated:

1. **Initialization**: Worker is created when `languages.onLanguage()` is called
2. **Language Service Creation**: Worker creates language service using provided plugins
3. **File Synchronization**: Files are synced between Monaco and the worker
4. **Feature Activation**: Language features are registered with Monaco
5. **Cleanup**: Worker is disposed when no longer needed

### File Synchronization

Files must be synchronized between Monaco Editor and the worker:

```typescript
// Sync function returns array of URIs to sync
const syncFiles = () => {
  return [Uri.file("/src/file1.ts"), Uri.file("/src/file2.ts")];
};

// Files are automatically synced when:
// - Editor content changes
// - Files are added/removed
// - Language service requests files
```

### Worker Context

The worker context provides access to Monaco's mirror models:

```typescript
workerContext.getMirrorModels(); // Get all models
workerContext.getMirrorModel(uri); // Get specific model
```

## TypeScript Integration Deep Dive

### Compiler Options

TypeScript compiler options control type checking behavior:

```typescript
const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  lib: ["ES2020", "DOM"],
  jsx: ts.JsxEmit.React,
  strict: true,
  // ... more options
};
```

### URI Converter

The URI converter translates between file names and URIs:

```typescript
const uriConverter = {
  asFileName(uri: URI): string {
    // Convert URI to file system path
    return uri.fsPath;
  },
  asUri(fileName: string): URI {
    // Convert file system path to URI
    return URI.file(fileName);
  },
};
```

### TypeScript Service Plugins

TypeScript service plugins provide TypeScript language features:

```typescript
import { create as createTypeScriptServicePlugin } from "volar-service-typescript";

const tsPlugins = createTypeScriptServicePlugin(ts);

// Plugins include:
// - Type checking
// - Code completion
// - Go to definition
// - Find references
// - And more...
```

## Auto Type Acquisition (ATA) Configuration

### Basic ATA Setup

ATA automatically fetches TypeScript type definitions from NPM:

```typescript
import { createNpmFileSystem } from "@volar/jsdelivr";

const env: LanguageServiceEnvironment = {
  workspaceFolders: [URI.parse("file:///")],
  fs: createNpmFileSystem(), // Enable ATA
};
```

### Custom Package Version Resolution

Control which package versions are fetched:

```typescript
const fs = createNpmFileSystem(undefined, (pkgName: string) => {
  // Return specific version or 'latest'
  if (pkgName === "vue") return "3.3.0";
  return "latest";
});
```

### ATA Behavior

ATA works by:

1. Detecting `import` statements in TypeScript files
2. Extracting package names from imports
3. Fetching `@types/package-name` from jsDelivr CDN
4. Adding type definitions to the TypeScript project

### Disabling ATA

To disable ATA, simply don't provide a file system:

```typescript
const env: LanguageServiceEnvironment = {
  workspaceFolders: [URI.parse("file:///")],
  // No fs = no ATA
};
```

## Performance Optimization Tips

### 1. Lazy Worker Creation

Create workers only when needed:

```typescript
let worker: WorkerLanguageService | undefined;

languages.onLanguage("my-lang", () => {
  if (!worker) {
    worker = editor.createWebWorker<WorkerLanguageService>({
      moduleId: "vs/language/my-lang/myLangWorker",
      label: "my-lang",
    });
  }
  // ... activate features
});
```

### 2. Efficient File Synchronization

Only sync files that are actually needed:

```typescript
const syncFiles = () => {
  // Only sync open files
  return editor
    .getModels()
    .map((model) => model.uri)
    .filter((uri) => uri.scheme === "file");
};
```

### 3. Debounce File Changes

Debounce file change notifications to reduce worker load:

```typescript
let syncTimeout: number | undefined;

editor.onDidChangeModelContent(() => {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    // Sync files
  }, 100);
});
```

### 4. Cache Language Service

Reuse language service instances:

```typescript
const languageServiceCache = new Map<string, WorkerLanguageService>();

function getLanguageService(languageId: string) {
  if (!languageServiceCache.has(languageId)) {
    const worker = createWorker(languageId);
    languageServiceCache.set(languageId, worker);
  }
  return languageServiceCache.get(languageId)!;
}
```

### 5. Optimize Plugin Loading

Load plugins only when needed:

```typescript
// Lazy load heavy plugins
const loadPlugins = async () => {
  const heavyPlugin = await import("./heavy-plugin");
  return [heavyPlugin.default];
};
```

### 6. Limit Diagnostic Checking

Only check diagnostics for visible files:

```typescript
activateMarkers(
  worker,
  ["my-lang"],
  "my-lang-markers-owner",
  () => {
    // Only check visible files
    return editor
      .getVisibleEditors()
      .map((editor) => editor.getModel()?.uri)
      .filter(Boolean) as Uri[];
  },
  editor
);
```

## Advanced Configuration

### Custom Language Service Setup

Customize language service creation:

```typescript
const languageService = createTypeScriptWorkerLanguageService({
  typescript: ts,
  compilerOptions: {
    /* ... */
  },
  uriConverter: {
    /* ... */
  },
  workerContext: ctx,
  env,
  languagePlugins: [
    /* ... */
  ],
  languageServicePlugins: [
    /* ... */
  ],
  setup({ language, project }) {
    // Custom setup logic
    // Access language and project here
  },
});
```

### Multiple Language Support

Support multiple languages in one worker:

```typescript
const worker = editor.createWebWorker<WorkerLanguageService>({
  moduleId: "vs/language/multi-lang/worker",
  label: "multi-lang",
});

// Register multiple languages
["typescript", "javascript", "vue"].forEach((langId) => {
  languages.onLanguage(langId, () => {
    registerProviders(worker, [langId], syncFiles, languages);
  });
});
```

## Troubleshooting

### Worker Not Loading

- Check worker file path is correct
- Verify `MonacoEnvironment.getWorker` is set
- Check browser console for errors

### TypeScript Not Working

- Ensure TypeScript is imported correctly
- Check compiler options are valid
- Verify URI converter is working

### ATA Not Fetching Types

- Check file system is provided
- Verify network connectivity
- Check browser console for fetch errors

### Performance Issues

- Reduce number of synced files
- Debounce file changes
- Limit diagnostic checking
- Use lazy plugin loading

## Related Documentation

- [Monaco Editor Documentation](https://microsoft.github.io/monaco-editor/)
- [@volar/language-service](../language-service/README.md) - Language service features
- [@volar/jsdelivr](../jsdelivr/README.md) - ATA file system
- [@volar/typescript](../typescript/README.md) - TypeScript integration

## Samples

- Implementation for Vue:\
  https://github.com/Kingwl/monaco-volar
