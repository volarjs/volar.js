# Plugin System

Volar.js uses a two-tier plugin system: **LanguagePlugin** for code generation and **LanguageServicePlugin** for language features.

## Overview

### LanguagePlugin vs LanguageServicePlugin

**LanguagePlugin** (`@volar/language-core`):

- Transforms source files into virtual code
- Handles code generation and mapping
- One plugin per file type/language
- Creates `VirtualCode` from `SourceScript`

**LanguageServicePlugin** (`@volar/language-service`):

- Provides language service features (completion, hover, etc.)
- Works with virtual code created by LanguagePlugins
- Multiple plugins can provide the same feature
- Results are merged automatically

## LanguagePlugin

### Interface

```typescript
interface LanguagePlugin<T> {
  getLanguageId(scriptId: T): string | undefined;
  createVirtualCode?(
    scriptId: T,
    languageId: string,
    snapshot: IScriptSnapshot,
    ctx: CodegenContext<T>
  ): VirtualCode | undefined;
  updateVirtualCode?(
    scriptId: T,
    virtualCode: VirtualCode,
    newSnapshot: IScriptSnapshot,
    ctx: CodegenContext<T>
  ): VirtualCode | undefined;
  disposeVirtualCode?(scriptId: T, virtualCode: VirtualCode): void;
  isAssociatedFileOnly?(scriptId: T, languageId: string): boolean;
}
```

### Lifecycle

1. **Registration**: Plugin is registered when creating `Language` instance
2. **File Detection**: `getLanguageId()` is called to identify file types
3. **VirtualCode Creation**: `createVirtualCode()` is called when file is opened/updated
4. **Incremental Updates**: `updateVirtualCode()` is called on file changes (if implemented)
5. **Cleanup**: `disposeVirtualCode()` is called when file is closed

### Example: Basic LanguagePlugin

```typescript
import type {
  LanguagePlugin,
  VirtualCode,
  IScriptSnapshot,
} from "@volar/language-core";
import { URI } from "vscode-uri";

const myPlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    if (uri.fsPath.endsWith(".myext")) {
      return "my-lang";
    }
  },

  createVirtualCode(uri, languageId, snapshot, ctx) {
    if (languageId !== "my-lang") return;

    const sourceCode = snapshot.getText(0, snapshot.getLength());
    const generatedCode = transformToTypeScript(sourceCode);

    return {
      id: "main",
      languageId: "typescript",
      snapshot: createSnapshot(generatedCode),
      mappings: createMappings(sourceCode, generatedCode, {
        verification: true,
        navigation: true,
        completion: true,
      }),
    };
  },
};
```

### Incremental Updates

Implement `updateVirtualCode` for better performance:

```typescript
updateVirtualCode(uri, virtualCode, newSnapshot, ctx) {
  // Only update changed parts
  const oldSnapshot = virtualCode.snapshot;
  const changeRange = oldSnapshot.getChangeRange(newSnapshot);

  if (changeRange) {
    // Incrementally update virtual code
    return updateVirtualCodeIncrementally(virtualCode, changeRange, newSnapshot);
  }

  // Fall back to full recreation
  return this.createVirtualCode(uri, 'my-lang', newSnapshot, ctx);
}
```

### Associated Files

Some files are only used as sources for generated files:

```typescript
isAssociatedFileOnly(uri, languageId) {
  // Files that shouldn't be processed directly
  return languageId === 'css' && uri.fsPath.endsWith('.vue');
}
```

## LanguageServicePlugin

### Interface

```typescript
interface LanguageServicePlugin {
  name?: string;
  capabilities: {
    hoverProvider?: boolean;
    completionProvider?: {
      triggerCharacters?: string[];
      resolveProvider?: boolean;
    };
    // ... many more capabilities
  };
  create(context: LanguageServiceContext): LanguageServicePluginInstance;
}
```

### Lifecycle

1. **Registration**: Plugin is registered when creating `LanguageService`
2. **Capability Declaration**: Plugin declares which features it provides
3. **Context Creation**: `create(context)` is called to create plugin instance
4. **Feature Provision**: Feature providers are called on-demand
5. **Dependency Injection**: Plugins can inject dependencies to other plugins

### Example: Basic LanguageServicePlugin

```typescript
import type {
  LanguageServicePlugin,
  LanguageServicePluginInstance,
} from "@volar/language-service";

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
        provideHover(document, position, token) {
          // Provide hover information
          return {
            contents: {
              kind: "markdown",
              value: "Hover information",
            },
          };
        },
        provideCompletionItems(document, position, context, token) {
          // Provide completions
          return {
            isIncomplete: false,
            items: [
              {
                label: "myCompletion",
                kind: 1,
                insertText: "myCompletion",
              },
            ],
          };
        },
      },
    };
  },
};
```

### Dependency Injection

Plugins can inject dependencies to other plugins:

```typescript
create(context) {
  // Inject a dependency
  const otherService = context.inject('myService', arg1, arg2);

  return {
    provide: {
      provideHover(document, position, token) {
        return otherService?.getHover(document, position);
      }
    }
  };
}
```

### Providing Dependencies

Plugins can provide dependencies to other plugins:

```typescript
create(context) {
  return {
    provide: {
      // Provide a service
      myService(arg1: string, arg2: number) {
        return {
          getHover(document, position) {
            // Implementation
          }
        };
      }
    }
  };
}
```

## Plugin Registration

### LanguagePlugin Registration

```typescript
import { createLanguage } from "@volar/language-core";

const language = createLanguage(
  [myLanguagePlugin, anotherLanguagePlugin], // Plugins array
  scriptRegistry,
  syncFunction
);
```

Plugins are tried in order. The first plugin that returns a result wins.

### LanguageServicePlugin Registration

```typescript
import { createLanguageService } from "@volar/language-service";

const languageService = createLanguageService(
  language,
  [myServicePlugin, anotherServicePlugin], // Plugins array
  env,
  project
);
```

Multiple plugins can provide the same feature. Results are merged automatically.

## Plugin Execution Order

### LanguagePlugin Execution

1. `getLanguageId()` is called on each plugin until one returns a language ID
2. `createVirtualCode()` is called on each plugin until one returns virtual code
3. Plugins are tried in registration order

### LanguageServicePlugin Execution

1. Feature request comes in
2. Each plugin with the capability is called
3. Results are merged (first result typically wins, but some features support merging)
4. Plugins are executed in registration order

## Best Practices

### LanguagePlugin Best Practices

1. **Efficient Updates**: Implement `updateVirtualCode` for better performance
2. **Proper Mappings**: Create accurate source mappings for good IDE experience
3. **CodeInformation**: Set appropriate flags for each code region
4. **Cleanup**: Implement `disposeVirtualCode` to free resources
5. **Error Handling**: Handle errors gracefully

### LanguageServicePlugin Best Practices

1. **Capability Declaration**: Only declare capabilities you actually provide
2. **Lazy Evaluation**: Don't compute expensive results unless needed
3. **Cancellation**: Respect cancellation tokens
4. **Error Handling**: Handle errors gracefully
5. **Dependency Injection**: Use dependency injection for loose coupling

## Common Patterns

### Pattern: TypeScript Language Plugin

```typescript
const tsPlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    if (uri.fsPath.endsWith(".ts") || uri.fsPath.endsWith(".tsx")) {
      return "typescript";
    }
  },
  createVirtualCode(uri, languageId, snapshot, ctx) {
    // TypeScript files are their own virtual code
    return {
      id: "main",
      languageId: "typescript",
      snapshot,
      mappings: [
        {
          sourceOffsets: [0],
          generatedOffsets: [0],
          lengths: [snapshot.getLength()],
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

### Pattern: Multi-file Language Plugin

```typescript
const multiFilePlugin: LanguagePlugin<URI> = {
  createVirtualCode(uri, languageId, snapshot, ctx) {
    const sourceCode = snapshot.getText(0, snapshot.getLength());

    // Generate multiple virtual codes
    const scriptCode = extractScript(sourceCode);
    const templateCode = extractTemplate(sourceCode);
    const styleCode = extractStyle(sourceCode);

    return {
      id: "root",
      languageId: "typescript",
      snapshot: createSnapshot(scriptCode),
      mappings: createMappings(sourceCode, scriptCode),
      embeddedCodes: [
        {
          id: "template",
          languageId: "html",
          snapshot: createSnapshot(templateCode),
          mappings: createMappings(sourceCode, templateCode),
        },
        {
          id: "style",
          languageId: "css",
          snapshot: createSnapshot(styleCode),
          mappings: createMappings(sourceCode, styleCode),
        },
      ],
    };
  },
};
```

### Pattern: Feature-specific Service Plugin

```typescript
const diagnosticsPlugin: LanguageServicePlugin = {
  name: "diagnostics",
  capabilities: {
    diagnosticProvider: {
      interFileDependencies: false,
      workspaceDiagnostics: false,
    },
  },
  create(context) {
    return {
      provide: {
        provideDiagnostics(document, token) {
          // Only provide diagnostics
          return checkDocument(document);
        },
      },
    };
  },
};
```

## Comprehensive Guides

For in-depth coverage of LanguagePlugin and VirtualCode, see the comprehensive guides:

- **[Language Plugin Complete Guide](guides/language-plugin-complete-guide.md)** - Complete LanguagePlugin reference
- **[VirtualCode Complete Reference](guides/virtualcode-complete-reference.md)** - Complete VirtualCode reference
- **[Mapping System Guide](guides/mapping-system-guide.md)** - Understanding mappings and CodeInformation
- **[Script Snapshot Guide](guides/script-snapshot-guide.md)** - Working with IScriptSnapshot
- **[SourceScript and Language System](guides/source-script-language-system.md)** - Script registry and lifecycle
- **[Advanced Patterns](guides/advanced-patterns.md)** - Advanced plugin patterns
- **[Integration Guide](guides/integration-guide.md)** - How components work together

## Related Documentation

- [Architecture Guide](ARCHITECTURE.md) - System architecture
- [Data Flow](DATA_FLOW.md) - Request flow
- [@volar/language-core](../packages/language-core/README.md) - LanguagePlugin API
- [@volar/language-service](../packages/language-service/README.md) - LanguageServicePlugin API
