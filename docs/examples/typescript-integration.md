# TypeScript Integration

Guide to integrating TypeScript support into language plugins.

## Overview

This guide shows how to add TypeScript support to a `LanguagePlugin` using `@volar/typescript`.

## Basic Integration

### Add TypeScript Options

```typescript
import type { LanguagePlugin } from "@volar/language-core";
import type { TypeScriptServiceScript } from "@volar/typescript";
import ts from "typescript";

const myPlugin: LanguagePlugin<URI> = {
  // ... other methods

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

## Advanced Integration

### Multiple Service Scripts

```typescript
typescript: {
  extraFileExtensions: [
    { extension: '.vue', isMixedContent: true, scriptKind: ts.ScriptKind.TS }
  ],
  getServiceScript(root: VirtualCode): TypeScriptServiceScript | undefined {
    if (root.languageId === 'typescript') {
      return {
        code: root,
        extension: '.ts',
        scriptKind: ts.ScriptKind.TS
      };
    }
  },
  getExtraServiceScripts(fileName: string, root: VirtualCode): TypeScriptExtraServiceScript[] {
    // Return additional service scripts
    return [
      {
        code: root,
        extension: '.ts',
        scriptKind: ts.ScriptKind.TS,
        fileName: fileName + '.d.ts'
      }
    ];
  }
}
```

## Complete Example

See the [TypeScript package README](../../packages/typescript/README.md) for complete examples.

## Related Documentation

- [@volar/typescript](../../packages/typescript/README.md) - TypeScript package documentation
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - TypeScript documentation
