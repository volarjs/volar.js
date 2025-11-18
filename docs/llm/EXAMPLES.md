# Code Examples (LLM-Optimized)

Complete, copy-paste ready code examples for common Volar.js use cases.

## Creating a LanguagePlugin

### Basic Plugin

```typescript
import type {
  LanguagePlugin,
  VirtualCode,
  IScriptSnapshot,
} from "@volar/language-core";
import { URI } from "vscode-uri";

const myPlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    if (uri.fsPath.endsWith(".myext")) return "my-lang";
  },

  createVirtualCode(uri, languageId, snapshot, ctx) {
    if (languageId !== "my-lang") return;

    const source = snapshot.getText(0, snapshot.getLength());
    const generated = transformToTypeScript(source);

    return {
      id: "main",
      languageId: "typescript",
      snapshot: {
        getText: (start, end) => generated.substring(start, end),
        getLength: () => generated.length,
        getChangeRange: () => undefined,
      },
      mappings: [
        {
          sourceOffsets: [0],
          generatedOffsets: [0],
          lengths: [source.length],
          data: {
            verification: true,
            navigation: true,
            completion: true,
            semantic: true,
            structure: true,
            format: true,
          },
        },
      ],
    };
  },
};
```

### Plugin with Incremental Updates

```typescript
const myPlugin: LanguagePlugin<URI> = {
  createVirtualCode(uri, languageId, snapshot, ctx) {
    // Full creation
    return this.generateVirtualCode(uri, languageId, snapshot, ctx);
  },

  updateVirtualCode(uri, virtualCode, newSnapshot, ctx) {
    const changeRange = virtualCode.snapshot.getChangeRange(newSnapshot);
    
    if (!changeRange) {
      // Fall back to full recreation
      return this.createVirtualCode(uri, 'my-lang', newSnapshot, ctx);
    }

    // Incremental update
    return this.updateIncrementally(virtualCode, changeRange, newSnapshot, ctx);
  },

  disposeVirtualCode(uri, virtualCode) {
    // Clean up resources
    this.parserCache.delete(uri.fsPath);
  },
};
```

### Plugin with Embedded Codes

```typescript
const multiFilePlugin: LanguagePlugin<URI> = {
  createVirtualCode(uri, languageId, snapshot, ctx) {
    const source = snapshot.getText(0, snapshot.getLength());
    
    // Extract parts
    const script = extractScript(source);
    const template = extractTemplate(source);
    const style = extractStyle(source);

    return {
      id: "root",
      languageId: "typescript",
      snapshot: createSnapshot(transformScript(script)),
      mappings: createScriptMappings(source, script),
      embeddedCodes: [
        {
          id: "template",
          languageId: "html",
          snapshot: createSnapshot(transformTemplate(template)),
          mappings: createTemplateMappings(source, template),
        },
        {
          id: "style",
          languageId: "css",
          snapshot: createSnapshot(transformStyle(style)),
          mappings: createStyleMappings(source, style),
        },
      ],
    };
  },
};
```

## Creating a LanguageServicePlugin

```typescript
import type {
  LanguageServicePlugin,
  LanguageServicePluginInstance,
} from "@volar/language-service";

const myServicePlugin: LanguageServicePlugin = {
  name: "my-plugin",
  capabilities: {
    hoverProvider: true,
    completionProvider: { triggerCharacters: ["."] },
  },
  create(context) {
    return {
      provide: {
        provideHover(document, position, token) {
          return {
            contents: { kind: "markdown", value: "Hover info" },
          };
        },
        provideCompletionItems(document, position, context, token) {
          return {
            isIncomplete: false,
            items: [{ label: "item", kind: 1 }],
          };
        },
      },
    };
  },
};
```

## Creating a Language Service

```typescript
import { createLanguage } from "@volar/language-core";
import { createLanguageService } from "@volar/language-service";
import { URI } from "vscode-uri";

// Create script registry
const scriptRegistry = new Map<URI, SourceScript<URI>>();

// Create language instance
const language = createLanguage(
  [myLanguagePlugin],
  scriptRegistry,
  (uri, includeFsFiles, shouldRegister) => {
    // Sync function - loads files from file system
    if (includeFsFiles && fs.existsSync(uri.fsPath)) {
      const content = fs.readFileSync(uri.fsPath, "utf-8");
      const snapshot = createSnapshot(content);
      language.scripts.set(uri, snapshot);
    }
  }
);

// Create language service
const languageService = createLanguageService(
  language,
  [myServicePlugin],
  { workspaceFolders: [URI.parse("file:///")] },
  {}
);

// Use language service
const hover = await languageService.getHover(uri, { line: 10, character: 5 });
const completions = await languageService.getCompletionItems(uri, { line: 10, character: 5 });
```

## Working with VirtualCode

```typescript
// Get source script
const sourceScript = language.scripts.get(uri);

if (sourceScript?.generated) {
  // Access root virtual code
  const virtualCode = sourceScript.generated.root;
  
  // Access embedded codes
  const embeddedCodes = sourceScript.generated.embeddedCodes;
  const templateCode = embeddedCodes.get('template');
  
  // Get mapper
  const mapper = language.maps.get(virtualCode, sourceScript);
  
  // Map source position to virtual position
  const sourceOffset = 50;
  for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
    sourceOffset,
    (data) => data.semantic === true
  )) {
    console.log(`Source ${sourceOffset} → Virtual ${virtualOffset}`);
  }
  
  // Iterate over all embedded codes
  import { forEachEmbeddedCode } from '@volar/language-core';
  for (const code of forEachEmbeddedCode(virtualCode)) {
    console.log(`${code.id}: ${code.languageId}`);
  }
}
```

## Creating an LSP Server

```typescript
import { createServerBase, createSimpleProject } from "@volar/language-server";
import { createConnection } from "vscode-languageserver/node";

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

## Monaco Editor Integration

```typescript
// worker.ts
import { createSimpleWorkerLanguageService } from "@volar/monaco/worker";
import { URI } from "vscode-uri";

self.onmessage = () => {
  worker.initialize((ctx) => {
    return createSimpleWorkerLanguageService({
      workerContext: ctx,
      env: { workspaceFolders: [URI.parse("file:///")] },
      languagePlugins: [myLanguagePlugin],
      languageServicePlugins: [myServicePlugin],
    });
  });
};

// main.ts
import { activateMarkers, registerProviders } from "@volar/monaco";

languages.onLanguage("my-lang", () => {
  const worker = editor.createWebWorker({
    moduleId: "worker",
    label: "my-lang",
  });
  activateMarkers(worker, ["my-lang"], "owner", () => [], editor);
  registerProviders(worker, ["my-lang"], () => [], languages);
});
```

## Error Handling

```typescript
try {
  const completions = await languageService.getCompletionItems(uri, position);
  // Handle results
} catch (error) {
  console.error("Error getting completions:", error);
  // Fallback or error reporting
}
```

## Integration Patterns

### Pattern: TypeScript Integration

```typescript
import { createTypeScriptProject } from "@volar/language-server";
import ts from "typescript";

const project = createTypeScriptProject(ts, undefined, (ctx) => ({
  languagePlugins: [myLanguagePlugin],
}));
```

### Pattern: File Watcher

```typescript
import { watch } from "chokidar";

watch("**/*.ts").on("change", (file) => {
  const uri = URI.file(file);
  const content = fs.readFileSync(file, "utf-8");
  language.scripts.set(uri, createSnapshot(content), "typescript");
});
```
