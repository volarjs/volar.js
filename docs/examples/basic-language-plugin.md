# Creating a Basic Language Plugin

Step-by-step guide to creating a `LanguagePlugin` for a custom file type.

## Overview

This guide shows how to create a `LanguagePlugin` that transforms custom file types into TypeScript virtual code.

## Step 1: Define the Plugin Structure

```typescript
import type {
  LanguagePlugin,
  VirtualCode,
  IScriptSnapshot,
} from "@volar/language-core";
import { URI } from "vscode-uri";

const myLanguagePlugin: LanguagePlugin<URI> = {
  // Plugin implementation
};
```

## Step 2: Implement getLanguageId

Identify files that belong to your language:

```typescript
getLanguageId(uri: URI): string | undefined {
  if (uri.fsPath.endsWith('.myext')) {
    return 'my-lang';
  }
}
```

## Step 3: Implement createVirtualCode

Transform source code into virtual code:

```typescript
createVirtualCode(
  uri: URI,
  languageId: string,
  snapshot: IScriptSnapshot,
  ctx: CodegenContext<URI>
): VirtualCode | undefined {
  if (languageId !== 'my-lang') return;

  // Get source code
  const sourceCode = snapshot.getText(0, snapshot.getLength());

  // Transform to TypeScript
  const generatedCode = transformToTypeScript(sourceCode);

  // Create virtual code snapshot
  const virtualSnapshot: IScriptSnapshot = {
    getText: (start, end) => generatedCode.substring(start, end),
    getLength: () => generatedCode.length,
    getChangeRange: () => undefined
  };

  // Create mappings
  const mappings = createMappings(sourceCode, generatedCode);

  return {
    id: 'main',
    languageId: 'typescript',
    snapshot: virtualSnapshot,
    mappings
  };
}
```

## Step 4: Create Mappings

Map positions between source and generated code:

```typescript
function createMappings(
  sourceCode: string,
  generatedCode: string
): CodeMapping[] {
  // Simple 1:1 mapping example
  return [
    {
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [sourceCode.length],
      data: {
        verification: true, // Enable diagnostics
        navigation: true, // Enable go-to-definition
        completion: true, // Enable code completion
        semantic: true, // Enable hover
        structure: true, // Enable document symbols
        format: true, // Enable formatting
      },
    },
  ];
}
```

## Step 5: Transform Function

Implement your transformation logic:

```typescript
function transformToTypeScript(sourceCode: string): string {
  // Example: Wrap source code in a function
  return `export function main() {\n${sourceCode}\n}`;
}
```

## Complete Example

```typescript
import type {
  LanguagePlugin,
  VirtualCode,
  IScriptSnapshot,
  CodeMapping,
} from "@volar/language-core";
import { URI } from "vscode-uri";

const myLanguagePlugin: LanguagePlugin<URI> = {
  getLanguageId(uri: URI): string | undefined {
    if (uri.fsPath.endsWith(".myext")) {
      return "my-lang";
    }
  },

  createVirtualCode(
    uri: URI,
    languageId: string,
    snapshot: IScriptSnapshot,
    ctx: CodegenContext<URI>
  ): VirtualCode | undefined {
    if (languageId !== "my-lang") return;

    const sourceCode = snapshot.getText(0, snapshot.getLength());
    const generatedCode = `export function main() {\n${sourceCode}\n}`;

    return {
      id: "main",
      languageId: "typescript",
      snapshot: {
        getText: (start, end) => generatedCode.substring(start, end),
        getLength: () => generatedCode.length,
        getChangeRange: () => undefined,
      },
      mappings: [
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
      ],
    };
  },
};
```

## Using the Plugin

```typescript
import { createLanguage } from "@volar/language-core";

const scriptRegistry = new Map<URI, SourceScript<URI>>();
const language = createLanguage([myLanguagePlugin], scriptRegistry, (uri) => {
  // Sync function - load file content
  const content = fs.readFileSync(uri.fsPath, "utf-8");
  const snapshot = createSnapshot(content);
  language.scripts.set(uri, snapshot, "my-lang");
});
```

## Next Steps

- Add incremental updates with `updateVirtualCode`
- Handle embedded codes for multi-part files
- Add TypeScript integration with `typescript` property
- See [Plugin System Guide](../PLUGINS.md) for advanced patterns
