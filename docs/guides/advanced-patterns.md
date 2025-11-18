# Advanced Patterns Guide

A comprehensive guide to advanced patterns for working with LanguagePlugins, VirtualCode, and the Volar.js system.

## Table of Contents

- [Introduction](#introduction)
- [Embedded Codes Pattern](#embedded-codes-pattern)
- [Multi-File Language Plugins](#multi-file-language-plugins)
- [Associated Files Pattern](#associated-files-pattern)
- [Incremental Update Patterns](#incremental-update-patterns)
- [Linked Code Mappings](#linked-code-mappings)
- [TypeScript Integration Patterns](#typescript-integration-patterns)
- [Performance Optimization Patterns](#performance-optimization-patterns)

## Introduction

This guide covers advanced patterns for building sophisticated language plugins in Volar.js. These patterns enable complex scenarios like multi-part files, incremental updates, and TypeScript integration.

## Embedded Codes Pattern

### Overview

Embedded codes allow a single source file to generate multiple virtual codes, each with its own language and mappings. This is essential for files like Vue and Svelte that contain multiple languages.

### Basic Pattern

```typescript
const plugin: LanguagePlugin<URI> = {
  createVirtualCode(uri, languageId, snapshot, ctx) {
    const sourceCode = snapshot.getText(0, snapshot.getLength());

    // Extract different parts
    const script = extractScript(sourceCode);
    const template = extractTemplate(sourceCode);
    const style = extractStyle(sourceCode);

    // Transform each part
    const scriptCode = transformScript(script);
    const templateCode = transformTemplate(template);
    const styleCode = transformStyle(style);

    // Create root virtual code with embedded codes
    return {
      id: 'root',
      languageId: 'typescript',
      snapshot: createSnapshot(scriptCode),
      mappings: createScriptMappings(sourceCode, scriptCode),
      embeddedCodes: [
        {
          id: 'template',
          languageId: 'html',
          snapshot: createSnapshot(templateCode),
          mappings: createTemplateMappings(sourceCode, templateCode),
        },
        {
          id: 'style',
          languageId: 'css',
          snapshot: createSnapshot(styleCode),
          mappings: createStyleMappings(sourceCode, styleCode),
        },
      ],
    };
  },
};
```

### Accessing Embedded Codes

```typescript
const sourceScript = language.scripts.get(uri);
if (sourceScript?.generated) {
  const rootCode = sourceScript.generated.root;
  
  // Access embedded codes map
  const embeddedCodes = sourceScript.generated.embeddedCodes;
  
  // Get specific embedded code
  const templateCode = embeddedCodes.get('template');
  const styleCode = embeddedCodes.get('style');
  
  // Iterate over all embedded codes (including root)
  import { forEachEmbeddedCode } from '@volar/language-core';
  for (const code of forEachEmbeddedCode(rootCode)) {
    console.log(`${code.id}: ${code.languageId}`);
  }
}
```

### Nested Embedded Codes

```typescript
return {
  id: 'root',
  languageId: 'typescript',
  snapshot: scriptSnapshot,
  mappings: scriptMappings,
  embeddedCodes: [
    {
      id: 'template',
      languageId: 'html',
      snapshot: templateSnapshot,
      mappings: templateMappings,
      embeddedCodes: [
        {
          id: 'script-in-template',
          languageId: 'typescript',
          snapshot: inlineScriptSnapshot,
          mappings: inlineScriptMappings,
        },
      ],
    },
  ],
};
```

### Mapping Embedded Codes

```typescript
// Get mapper for embedded code
const templateCode = embeddedCodes.get('template');
if (templateCode) {
  const mapper = language.maps.get(templateCode, sourceScript);
  
  // Map positions in template
  for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(sourceOffset)) {
    // Process template position
  }
}
```

## Multi-File Language Plugins

### Overview

Some languages span multiple files. Use `CodegenContext.getAssociatedScript()` to access related files during code generation.

### Basic Pattern

```typescript
const multiFilePlugin: LanguagePlugin<URI> = {
  createVirtualCode(uri, languageId, snapshot, ctx) {
    // Get associated files
    const scriptFile = ctx.getAssociatedScript(URI.file(uri.fsPath + '.script'));
    const styleFile = ctx.getAssociatedScript(URI.file(uri.fsPath + '.style'));
    const configFile = ctx.getAssociatedScript(URI.file('config.json'));

    // Combine files
    const mainContent = snapshot.getText(0, snapshot.getLength());
    let generatedCode = transformMain(mainContent);

    if (scriptFile) {
      const scriptContent = scriptFile.snapshot.getText(0, scriptFile.snapshot.getLength());
      generatedCode += '\n' + transformScript(scriptContent);
    }

    if (styleFile) {
      const styleContent = styleFile.snapshot.getText(0, styleFile.snapshot.getLength());
      generatedCode += '\n' + transformStyle(styleContent);
    }

    if (configFile) {
      const configContent = configFile.snapshot.getText(0, configFile.snapshot.getLength());
      const config = JSON.parse(configContent);
      generatedCode = applyConfig(generatedCode, config);
    }

    return {
      id: 'main',
      languageId: 'typescript',
      snapshot: createSnapshot(generatedCode),
      mappings: createMappings(mainContent, generatedCode),
    };
  },
};
```

### Using Associated Script Mappings

For complex multi-file scenarios, use `associatedScriptMappings`:

```typescript
return {
  id: 'main',
  languageId: 'typescript',
  snapshot: combinedSnapshot,
  mappings: [
    // Mappings to primary source
    {
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [mainContent.length],
      data: { verification: true },
    },
  ],
  associatedScriptMappings: new Map([
    // Mappings to script file
    [scriptFileId, [
      {
        sourceOffsets: [0],
        generatedOffsets: [mainContent.length],
        lengths: [scriptContent.length],
        data: { verification: true },
      },
    ]],
    // Mappings to style file
    [styleFileId, [
      {
        sourceOffsets: [0],
        generatedOffsets: [mainContent.length + scriptContent.length],
        lengths: [styleContent.length],
        data: { verification: true },
      },
    ]],
  ]),
};
```

### Accessing Multi-File Mappings

```typescript
// Iterate over all source scripts for a virtual code
for (const [sourceScript, mapper] of language.maps.forEach(virtualCode)) {
  console.log(`Source: ${sourceScript.id}`);
  // Use mapper for this source script
}
```

## Associated Files Pattern

### Overview

Some files should only be used as sources for generated files, not processed directly. Use `isAssociatedFileOnly` to mark these files.

### Basic Pattern

```typescript
const plugin: LanguagePlugin<URI> = {
  isAssociatedFileOnly(uri, languageId) {
    // CSS files in Vue components are only sources
    if (languageId === 'css' && uri.fsPath.endsWith('.vue')) {
      return true;
    }
    
    // SCSS files shouldn't be processed as TypeScript
    if (languageId === 'scss') {
      return true;
    }
    
    return false;
  },

  createVirtualCode(uri, languageId, snapshot, ctx) {
    // This won't be called for associated-only files
    // But the file can be accessed via ctx.getAssociatedScript()
  },
};
```

### Using Associated Files

```typescript
createVirtualCode(uri, languageId, snapshot, ctx) {
  // Get associated CSS file
  const cssUri = URI.file(uri.fsPath + '.css');
  const cssFile = ctx.getAssociatedScript(cssUri);
  
  if (cssFile) {
    // Use CSS file in code generation
    const cssContent = cssFile.snapshot.getText(0, cssFile.snapshot.getLength());
    // Transform CSS and include in generated code
  }
}
```

## Incremental Update Patterns

### Overview

Implement `updateVirtualCode` for better performance by only updating changed sections.

### Basic Incremental Update

```typescript
const plugin: LanguagePlugin<URI> = {
  createVirtualCode(uri, languageId, snapshot, ctx) {
    // Full creation
    return this.generateVirtualCode(uri, languageId, snapshot, ctx);
  },

  updateVirtualCode(uri, virtualCode, newSnapshot, ctx) {
    const oldSnapshot = virtualCode.snapshot;
    
    // Get change range
    const changeRange = oldSnapshot.getChangeRange(newSnapshot);
    
    if (!changeRange) {
      // No change range, fall back to full recreation
      return this.createVirtualCode(uri, 'my-lang', newSnapshot, ctx);
    }

    // Check if change is too large
    const changeRatio = changeRange.span.length / oldSnapshot.getLength();
    if (changeRatio > 0.5) {
      // Change is too large, full recreation is better
      return this.createVirtualCode(uri, 'my-lang', newSnapshot, ctx);
    }

    // Incremental update
    return this.updateIncrementally(virtualCode, changeRange, newSnapshot, ctx);
  },

  private updateIncrementally(
    virtualCode: VirtualCode,
    changeRange: TextChangeRange,
    newSnapshot: IScriptSnapshot,
    ctx: CodegenContext<URI>
  ): VirtualCode {
    // Get unchanged parts
    const beforeChange = virtualCode.snapshot.getText(0, changeRange.span.start);
    const afterChange = virtualCode.snapshot.getText(
      changeRange.span.start + changeRange.span.length,
      virtualCode.snapshot.getLength()
    );

    // Get new changed part
    const newChangedPart = newSnapshot.getText(
      changeRange.span.start,
      changeRange.span.start + changeRange.newLength
    );

    // Rebuild content
    const newContent = beforeChange + newChangedPart + afterChange;

    // Update mappings (shift offsets after change)
    const updatedMappings = this.updateMappings(
      virtualCode.mappings,
      changeRange
    );

    return {
      ...virtualCode,
      snapshot: createSnapshot(newContent),
      mappings: updatedMappings,
    };
  },

  private updateMappings(
    mappings: CodeMapping[],
    changeRange: TextChangeRange
  ): CodeMapping[] {
    // Shift mappings after the change
    return mappings.map(mapping => ({
      ...mapping,
      sourceOffsets: mapping.sourceOffsets.map(offset => {
        if (offset > changeRange.span.start + changeRange.span.length) {
          // After change: shift by difference
          return offset + (changeRange.newLength - changeRange.span.length);
        }
        return offset;
      }),
      generatedOffsets: mapping.generatedOffsets.map(offset => {
        // Similar logic for generated offsets
        // ...
        return offset;
      }),
    }));
  },
};
```

### Incremental Update with Embedded Codes

```typescript
updateVirtualCode(uri, virtualCode, newSnapshot, ctx) {
  const changeRange = newSnapshot.getChangeRange(virtualCode.snapshot);
  
  if (!changeRange) {
    return this.createVirtualCode(uri, 'my-lang', newSnapshot, ctx);
  }

  // Determine which embedded codes are affected
  const affectedCodes = this.getAffectedEmbeddedCodes(virtualCode, changeRange);

  // Update root code
  const updatedRoot = this.updateRootCode(virtualCode, changeRange, newSnapshot);

  // Update embedded codes
  const updatedEmbeddedCodes = virtualCode.embeddedCodes?.map(embedded => {
    if (affectedCodes.has(embedded.id)) {
      return this.updateEmbeddedCode(embedded, changeRange, newSnapshot);
    }
    return embedded; // Unchanged
  });

  return {
    ...updatedRoot,
    embeddedCodes: updatedEmbeddedCodes,
  };
}
```

## Linked Code Mappings

### Overview

Linked code mappings enable synchronized editing of paired elements (e.g., HTML tag pairs).

### Basic Pattern

```typescript
createVirtualCode(uri, languageId, snapshot, ctx) {
  const sourceCode = snapshot.getText(0, snapshot.getLength());
  
  // Find paired elements (e.g., HTML tags)
  const pairs = findPairedElements(sourceCode);
  
  const linkedMappings: Mapping[] = [];
  for (const pair of pairs) {
    // Opening tag mapping
    linkedMappings.push({
      sourceOffsets: [pair.openStart],
      generatedOffsets: [pair.openStart],
      lengths: [pair.openLength],
      data: {},
    });
    
    // Closing tag mapping
    linkedMappings.push({
      sourceOffsets: [pair.closeStart],
      generatedOffsets: [pair.closeStart],
      lengths: [pair.closeLength],
      data: {},
    });
  }

  return {
    id: 'main',
    languageId: 'html',
    snapshot: createSnapshot(sourceCode),
    mappings: createMappings(sourceCode, sourceCode),
    linkedCodeMappings: linkedMappings,
  };
}
```

### Using Linked Code Maps

```typescript
// Get linked code map
const linkedCodeMap = language.linkedCodeMaps.get(virtualCode);

if (linkedCodeMap) {
  // Get linked offsets
  const sourceOffset = 10;
  for (const linkedOffset of linkedCodeMap.getLinkedOffsets(sourceOffset)) {
    console.log(`Linked offset: ${linkedOffset}`);
  }
}
```

## TypeScript Integration Patterns

### Overview

TypeScript integration enables virtual code to be processed by TypeScript's language service.

### Basic TypeScript Plugin Pattern

```typescript
import type { LanguagePlugin, VirtualCode } from '@volar/language-core';
import type { TypeScriptServiceScript } from '@volar/typescript';
import ts from 'typescript';

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

  typescript: {
    extraFileExtensions: [
      { extension: '.vue', isMixedContent: true, scriptKind: ts.ScriptKind.TS },
    ],
    getServiceScript(root: VirtualCode): TypeScriptServiceScript | undefined {
      if (root.languageId === 'typescript' || root.languageId === 'javascript') {
        return {
          code: root,
          extension: root.languageId === 'typescript' ? '.ts' : '.js',
          scriptKind: ts.ScriptKind.TS,
        };
      }
    },
  },
};
```

### TypeScript with Custom Extensions

```typescript
typescript: {
  extraFileExtensions: [
    { extension: '.myext', isMixedContent: true, scriptKind: ts.ScriptKind.TS },
  ],
  getServiceScript(root: VirtualCode): TypeScriptServiceScript | undefined {
    if (root.languageId === 'typescript') {
      return {
        code: root,
        extension: '.ts',
        scriptKind: ts.ScriptKind.TS,
      };
    }
  },
  getExtraServiceScripts?(fileName: string, root: VirtualCode): TypeScriptExtraServiceScript[] {
    // Return additional service scripts if needed
    return [];
  },
}
```

## Performance Optimization Patterns

### Caching Patterns

```typescript
class CachedPlugin implements LanguagePlugin<URI> {
  private parserCache = new Map<string, Parser>();
  private virtualCodeCache = new WeakMap<IScriptSnapshot, VirtualCode>();

  createVirtualCode(uri, languageId, snapshot, ctx) {
    // Check cache
    const cached = this.virtualCodeCache.get(snapshot);
    if (cached) {
      return cached;
    }

    // Get or create parser
    let parser = this.parserCache.get(uri.fsPath);
    if (!parser) {
      parser = createParser();
      this.parserCache.set(uri.fsPath, parser);
    }

    // Generate virtual code
    const virtualCode = this.generateVirtualCode(uri, languageId, snapshot, parser);

    // Cache result
    this.virtualCodeCache.set(snapshot, virtualCode);

    return virtualCode;
  }

  disposeVirtualCode(uri, virtualCode) {
    // Clean up parser cache
    this.parserCache.delete(uri.fsPath);
  }
}
```

### Lazy Evaluation Pattern

```typescript
createVirtualCode(uri, languageId, snapshot, ctx) {
  // Create lazy snapshot
  const lazySnapshot: IScriptSnapshot = {
    getText: (start, end) => {
      // Lazy load content
      const content = this.loadContent(uri);
      return content.substring(start, end);
    },
    getLength: () => {
      const content = this.loadContent(uri);
      return content.length;
    },
    getChangeRange: () => undefined,
  };

  return {
    id: 'main',
    languageId: 'typescript',
    snapshot: lazySnapshot,
    mappings: [/* ... */],
  };
}
```

### Batch Processing Pattern

```typescript
class BatchPlugin implements LanguagePlugin<URI> {
  private pendingUpdates = new Map<URI, IScriptSnapshot>();
  private updateTimer: NodeJS.Timeout | undefined;

  createVirtualCode(uri, languageId, snapshot, ctx) {
    // Queue update
    this.pendingUpdates.set(uri, snapshot);
    
    // Batch updates
    this.scheduleBatchUpdate();
    
    // Return current virtual code or create new
    return this.getOrCreateVirtualCode(uri, languageId, snapshot, ctx);
  }

  private scheduleBatchUpdate() {
    if (this.updateTimer) {
      return; // Already scheduled
    }

    this.updateTimer = setTimeout(() => {
      // Process all pending updates
      for (const [uri, snapshot] of this.pendingUpdates) {
        this.processUpdate(uri, snapshot);
      }
      this.pendingUpdates.clear();
      this.updateTimer = undefined;
    }, 100); // Batch every 100ms
  }
}
```

## Related Documentation

- [Language Plugin Complete Guide](./language-plugin-complete-guide.md) - Plugin basics
- [VirtualCode Complete Reference](./virtualcode-complete-reference.md) - VirtualCode structure
- [Mapping System Guide](./mapping-system-guide.md) - Mapping system
- [Script Snapshot Guide](./script-snapshot-guide.md) - Snapshots
- [SourceScript and Language System](./source-script-language-system.md) - Script registry
- [Integration Guide](./integration-guide.md) - System integration

