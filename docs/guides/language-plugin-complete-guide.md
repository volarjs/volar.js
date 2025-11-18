# Language Plugin Complete Guide

A comprehensive guide to understanding and implementing `LanguagePlugin` in Volar.js.

## Table of Contents

- [Introduction](#introduction)
- [LanguagePlugin Interface](#languageplugin-interface)
- [Lifecycle and Execution Flow](#lifecycle-and-execution-flow)
- [Plugin Registration and Ordering](#plugin-registration-and-ordering)
- [Methods Deep Dive](#methods-deep-dive)
- [CodegenContext Usage](#codegencontext-usage)
- [Best Practices](#best-practices)
- [Common Patterns](#common-patterns)

## Introduction

A `LanguagePlugin` is the foundation of language processing in Volar.js. It transforms source files into **virtual code** that can be processed by language service features like IntelliSense, diagnostics, and formatting.

### What is a LanguagePlugin?

A `LanguagePlugin` is an object that:
- Identifies which files belong to a specific language
- Transforms source code into virtual code (typically TypeScript)
- Maps positions between source and virtual code
- Handles incremental updates for performance
- Manages cleanup when files are closed

### Why LanguagePlugins?

LanguagePlugins enable Volar.js to:
- Support any language that can be transformed to TypeScript
- Provide IDE features for languages without native LSP support
- Handle multi-file languages (like Vue, Svelte)
- Support embedded languages within files

## LanguagePlugin Interface

The complete `LanguagePlugin` interface:

```typescript
interface LanguagePlugin<T = unknown, K extends VirtualCode = VirtualCode> {
  /**
   * Identifies the language ID for a file.
   * Called when a file needs language identification.
   */
  getLanguageId(scriptId: T): string | undefined;

  /**
   * Creates virtual code from a source file.
   * Called when a file is first opened or when updateVirtualCode is not implemented.
   */
  createVirtualCode?(
    scriptId: T,
    languageId: string,
    snapshot: IScriptSnapshot,
    ctx: CodegenContext<T>
  ): K | undefined;

  /**
   * Incrementally updates virtual code.
   * Optional - if not provided, createVirtualCode is called on every change.
   */
  updateVirtualCode?(
    scriptId: T,
    virtualCode: K,
    newSnapshot: IScriptSnapshot,
    ctx: CodegenContext<T>
  ): K | undefined;

  /**
   * Cleans up resources when a file is closed.
   * Optional - called when a source script is deleted.
   */
  disposeVirtualCode?(scriptId: T, virtualCode: K): void;

  /**
   * Determines if a file should only be used as a source for generated files.
   * Used in TypeScript plugin mode to exclude certain files from direct processing.
   */
  isAssociatedFileOnly?(scriptId: T, languageId: string): boolean;
}
```

### Generic Parameters

- `T`: Script identifier type (typically `URI` from `vscode-uri`)
- `K`: Virtual code type (extends `VirtualCode`, allows custom virtual code types)

## Lifecycle and Execution Flow

### Plugin Lifecycle

1. **Registration**: Plugin is registered when creating a `Language` instance
2. **File Detection**: `getLanguageId()` is called to identify file types
3. **VirtualCode Creation**: `createVirtualCode()` is called when file is opened/updated
4. **Incremental Updates**: `updateVirtualCode()` is called on file changes (if implemented)
5. **Cleanup**: `disposeVirtualCode()` is called when file is closed

### Execution Flow Diagram

```
File Opened/Changed
    ↓
getLanguageId() → Identify language
    ↓
createVirtualCode() or updateVirtualCode()
    ↓
VirtualCode created/updated
    ↓
Mappings established
    ↓
Language service features use VirtualCode
    ↓
File Closed
    ↓
disposeVirtualCode() → Cleanup
```

### When Methods Are Called

**getLanguageId**:
- When a file is first encountered
- When determining which plugin should handle a file
- Called on all plugins until one returns a language ID

**createVirtualCode**:
- When a file is first opened
- When `updateVirtualCode` is not implemented
- When `updateVirtualCode` returns `undefined`
- After file content changes (if no incremental update)

**updateVirtualCode**:
- When file content changes
- Only if implemented
- Should return `undefined` to fall back to `createVirtualCode`

**disposeVirtualCode**:
- When a file is closed
- When a source script is deleted
- For cleanup of resources (parsers, caches, etc.)

**isAssociatedFileOnly**:
- During script registration
- To determine if a file should be processed directly
- Used in TypeScript plugin mode

## Plugin Registration and Ordering

### Registration

Plugins are registered when creating a `Language` instance:

```typescript
import { createLanguage } from '@volar/language-core';
import { URI } from 'vscode-uri';

const scriptRegistry = new Map<URI, SourceScript<URI>>();

const language = createLanguage(
  [
    myLanguagePlugin,      // Plugin 1
    anotherLanguagePlugin, // Plugin 2
    typescriptPlugin,      // Plugin 3
  ],
  scriptRegistry,
  syncFunction
);
```

### Execution Order

Plugins are executed in registration order:

1. **getLanguageId**: Called on each plugin until one returns a language ID
2. **createVirtualCode**: Called on each plugin until one returns virtual code
3. **updateVirtualCode**: Called only on the plugin that created the virtual code

**Important**: The first plugin that returns a result wins. Order matters!

### Best Practices for Ordering

- Put more specific plugins first (e.g., Vue before TypeScript)
- Put TypeScript plugin last (as fallback)
- Group related plugins together

## Methods Deep Dive

### getLanguageId

Identifies the language ID for a file.

```typescript
getLanguageId(scriptId: T): string | undefined
```

**Parameters**:
- `scriptId`: File identifier (typically a URI)

**Returns**: Language ID string (e.g., `"typescript"`, `"vue"`) or `undefined`

**Example**:

```typescript
getLanguageId(uri: URI): string | undefined {
  // Check file extension
  if (uri.fsPath.endsWith('.vue')) {
    return 'vue';
  }
  if (uri.fsPath.endsWith('.svelte')) {
    return 'svelte';
  }
  
  // Check file name
  if (uri.fsPath.endsWith('tsconfig.json')) {
    return 'json';
  }
  
  // Return undefined if not handled
  return undefined;
}
```

**Best Practices**:
- Use file extensions for identification
- Return `undefined` if the file is not handled
- Be specific to avoid conflicts

### createVirtualCode

Creates virtual code from a source file.

```typescript
createVirtualCode?(
  scriptId: T,
  languageId: string,
  snapshot: IScriptSnapshot,
  ctx: CodegenContext<T>
): K | undefined
```

**Parameters**:
- `scriptId`: File identifier
- `languageId`: Language ID (from `getLanguageId`)
- `snapshot`: Immutable snapshot of file content
- `ctx`: Code generation context (for accessing associated files)

**Returns**: `VirtualCode` instance or `undefined`

**Example**:

```typescript
createVirtualCode(
  uri: URI,
  languageId: string,
  snapshot: IScriptSnapshot,
  ctx: CodegenContext<URI>
): VirtualCode | undefined {
  // Only handle our language
  if (languageId !== 'my-lang') {
    return undefined;
  }

  // Get source code
  const sourceCode = snapshot.getText(0, snapshot.getLength());

  // Transform to TypeScript
  const generatedCode = transformToTypeScript(sourceCode);

  // Create virtual code snapshot
  const virtualSnapshot: IScriptSnapshot = {
    getText: (start, end) => generatedCode.substring(start, end),
    getLength: () => generatedCode.length,
    getChangeRange: () => undefined,
  };

  // Create mappings
  const mappings: CodeMapping[] = [
    {
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [sourceCode.length],
      data: {
        verification: true,
        navigation: true,
        completion: true,
        semantic: true,
        structure: true,
        format: true,
      },
    },
  ];

  return {
    id: 'main',
    languageId: 'typescript',
    snapshot: virtualSnapshot,
    mappings,
  };
}
```

**Key Points**:
- Must return `VirtualCode` or `undefined`
- `snapshot` is immutable - don't modify it
- Create accurate mappings for good IDE experience
- Set appropriate `CodeInformation` flags

### updateVirtualCode

Incrementally updates virtual code for better performance.

```typescript
updateVirtualCode?(
  scriptId: T,
  virtualCode: K,
  newSnapshot: IScriptSnapshot,
  ctx: CodegenContext<T>
): K | undefined
```

**Parameters**:
- `scriptId`: File identifier
- `virtualCode`: Existing virtual code to update
- `newSnapshot`: New file content snapshot
- `ctx`: Code generation context

**Returns**: Updated `VirtualCode` or `undefined` (to fall back to `createVirtualCode`)

**Example**:

```typescript
updateVirtualCode(
  uri: URI,
  virtualCode: VirtualCode,
  newSnapshot: IScriptSnapshot,
  ctx: CodegenContext<URI>
): VirtualCode | undefined {
  const oldSnapshot = virtualCode.snapshot;
  
  // Get change range for incremental update
  const changeRange = oldSnapshot.getChangeRange(newSnapshot);
  
  if (!changeRange) {
    // No change range available, fall back to full recreation
    return this.createVirtualCode(uri, 'my-lang', newSnapshot, ctx);
  }

  // Incrementally update virtual code
  const updatedCode = incrementallyUpdateCode(
    virtualCode,
    changeRange,
    newSnapshot
  );

  return updatedCode;
}
```

**Performance Benefits**:
- Only re-parse changed sections
- Preserve unchanged parts
- Faster updates for large files

**When to Return undefined**:
- Change range is too large
- Incremental update is not possible
- Fall back to full recreation

### disposeVirtualCode

Cleans up resources when a file is closed.

```typescript
disposeVirtualCode?(scriptId: T, virtualCode: K): void
```

**Parameters**:
- `scriptId`: File identifier
- `virtualCode`: Virtual code to dispose

**Example**:

```typescript
disposeVirtualCode(uri: URI, virtualCode: VirtualCode): void {
  // Dispose parser if cached
  if (this.parserCache.has(uri)) {
    this.parserCache.get(uri)?.dispose();
    this.parserCache.delete(uri);
  }

  // Dispose snapshot if it has resources
  virtualCode.snapshot.dispose?.();
}
```

**What to Clean Up**:
- Parsers and ASTs
- Caches
- Event listeners
- Other resources

### isAssociatedFileOnly

Determines if a file should only be used as a source for generated files.

```typescript
isAssociatedFileOnly?(scriptId: T, languageId: string): boolean
```

**Parameters**:
- `scriptId`: File identifier
- `languageId`: Language ID

**Returns**: `true` if file should only be used as source, `false` otherwise

**Example**:

```typescript
isAssociatedFileOnly(uri: URI, languageId: string): boolean {
  // CSS files in Vue components are only sources
  if (languageId === 'css' && uri.fsPath.endsWith('.vue')) {
    return true;
  }
  
  // Style blocks shouldn't be processed as TypeScript
  if (languageId === 'scss' && uri.fsPath.includes('.vue')) {
    return true;
  }
  
  return false;
}
```

**Use Cases**:
- CSS/SCSS files in component files
- Template files that generate code
- Files that shouldn't be type-checked directly

## CodegenContext Usage

`CodegenContext` provides access to associated files during code generation.

### Interface

```typescript
interface CodegenContext<T = unknown> {
  /**
   * Gets an associated script by ID.
   * Used to access related files during code generation.
   */
  getAssociatedScript(scriptId: T): SourceScript<T> | undefined;
}
```

### Usage Example

```typescript
createVirtualCode(
  uri: URI,
  languageId: string,
  snapshot: IScriptSnapshot,
  ctx: CodegenContext<URI>
): VirtualCode | undefined {
  // Access associated files
  const cssFile = ctx.getAssociatedScript(URI.parse(uri.fsPath + '.css'));
  const configFile = ctx.getAssociatedScript(URI.parse('tsconfig.json'));

  // Use associated files in code generation
  const sourceCode = snapshot.getText(0, snapshot.getLength());
  let generatedCode = transformToTypeScript(sourceCode);

  // Include CSS if available
  if (cssFile) {
    const cssContent = cssFile.snapshot.getText(0, cssFile.snapshot.getLength());
    generatedCode += `\n// CSS: ${cssContent}`;
  }

  return {
    id: 'main',
    languageId: 'typescript',
    snapshot: createSnapshot(generatedCode),
    mappings: createMappings(sourceCode, generatedCode),
  };
}
```

**When to Use**:
- Multi-file languages (Vue, Svelte)
- Files that reference other files
- Configuration-dependent code generation

## Best Practices

### 1. Efficient Updates

Implement `updateVirtualCode` for better performance:

```typescript
updateVirtualCode(uri, virtualCode, newSnapshot, ctx) {
  const changeRange = virtualCode.snapshot.getChangeRange(newSnapshot);
  if (changeRange) {
    // Incremental update
    return updateIncrementally(virtualCode, changeRange, newSnapshot);
  }
  // Fall back to full recreation
  return this.createVirtualCode(uri, 'my-lang', newSnapshot, ctx);
}
```

### 2. Accurate Mappings

Create precise mappings for good IDE experience:

```typescript
// Good: Precise mapping
mappings: [
  {
    sourceOffsets: [10, 25, 40],
    generatedOffsets: [15, 30, 45],
    lengths: [5, 5, 5],
    data: { verification: true }
  }
]

// Bad: Imprecise mapping
mappings: [
  {
    sourceOffsets: [0],
    generatedOffsets: [0],
    lengths: [sourceCode.length], // Too broad
    data: { verification: true }
  }
]
```

### 3. Proper CodeInformation

Set appropriate flags for each code region:

```typescript
data: {
  verification: true,  // Enable diagnostics and code actions
  navigation: true,   // Enable go-to-definition, references
  completion: true,   // Enable code completion
  semantic: true,     // Enable hover, semantic tokens
  structure: true,    // Enable document symbols
  format: true,       // Enable formatting
}
```

### 4. Error Handling

Handle errors gracefully:

```typescript
createVirtualCode(uri, languageId, snapshot, ctx) {
  try {
    // Code generation
    return virtualCode;
  } catch (error) {
    console.error(`Failed to create virtual code for ${uri}:`, error);
    // Return undefined to skip this file
    return undefined;
  }
}
```

### 5. Resource Cleanup

Always clean up resources:

```typescript
disposeVirtualCode(uri, virtualCode) {
  // Clean up parser
  this.parserCache.delete(uri);
  
  // Clean up snapshot
  virtualCode.snapshot.dispose?.();
  
  // Clean up any other resources
  this.eventListeners.get(uri)?.forEach(listener => {
    removeEventListener(listener);
  });
  this.eventListeners.delete(uri);
}
```

## Common Patterns

### Pattern 1: Simple Single-File Plugin

```typescript
const simplePlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    return uri.fsPath.endsWith('.myext') ? 'my-lang' : undefined;
  },

  createVirtualCode(uri, languageId, snapshot, ctx) {
    if (languageId !== 'my-lang') return;

    const source = snapshot.getText(0, snapshot.getLength());
    const generated = transformToTypeScript(source);

    return {
      id: 'main',
      languageId: 'typescript',
      snapshot: createSnapshot(generated),
      mappings: [{
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
      }],
    };
  },
};
```

### Pattern 2: Multi-File Plugin with Embedded Codes

```typescript
const multiFilePlugin: LanguagePlugin<URI> = {
  createVirtualCode(uri, languageId, snapshot, ctx) {
    const source = snapshot.getText(0, snapshot.getLength());
    
    // Extract different parts
    const script = extractScript(source);
    const template = extractTemplate(source);
    const style = extractStyle(source);

    return {
      id: 'root',
      languageId: 'typescript',
      snapshot: createSnapshot(script),
      mappings: createScriptMappings(source, script),
      embeddedCodes: [
        {
          id: 'template',
          languageId: 'html',
          snapshot: createSnapshot(template),
          mappings: createTemplateMappings(source, template),
        },
        {
          id: 'style',
          languageId: 'css',
          snapshot: createSnapshot(style),
          mappings: createStyleMappings(source, style),
        },
      ],
    };
  },
};
```

### Pattern 3: TypeScript Pass-Through Plugin

```typescript
const typescriptPlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    if (uri.fsPath.endsWith('.ts') || uri.fsPath.endsWith('.tsx')) {
      return 'typescript';
    }
    if (uri.fsPath.endsWith('.js') || uri.fsPath.endsWith('.jsx')) {
      return 'javascript';
    }
  },

  createVirtualCode(uri, languageId, snapshot, ctx) {
    // TypeScript files are their own virtual code
    return {
      id: 'main',
      languageId: languageId === 'javascript' ? 'javascript' : 'typescript',
      snapshot,
      mappings: [{
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
      }],
    };
  },
};
```

## Related Documentation

- [VirtualCode Complete Reference](./virtualcode-complete-reference.md) - Deep dive into VirtualCode
- [Mapping System Guide](./mapping-system-guide.md) - Understanding mappings and CodeInformation
- [Script Snapshot Guide](./script-snapshot-guide.md) - Working with IScriptSnapshot
- [Advanced Patterns](./advanced-patterns.md) - Advanced plugin patterns
- [Integration Guide](./integration-guide.md) - How plugins integrate with the system

