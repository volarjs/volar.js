# @volar/eslint

ESLint integration for Volar.js. Provides an ESLint processor that handles virtual code and maps diagnostics back to source positions.

## Overview

`@volar/eslint` provides:

- **ESLint Processor**: Preprocesses files to extract virtual code
- **Position Mapping**: Maps ESLint diagnostics from virtual code back to source
- **Multi-language Support**: Handles embedded languages in source files

## Installation

```bash
npm install @volar/eslint
```

## API Reference

### createProcessor

Creates an ESLint processor that handles virtual code.

```typescript
function createProcessor(
  languagePlugins: LanguagePlugin<string>[],
  caseSensitive: boolean,
  extensionsMap?: Record<string, string>,
  supportsAutofix?: boolean
): Linter.Processor;
```

**Parameters:**

- `languagePlugins`: Array of language plugins to use
- `caseSensitive`: Whether file names are case-sensitive
- `extensionsMap`: Map of language IDs to file extensions (optional)
- `supportsAutofix`: Whether autofix is supported (default: true)

**Returns:** An ESLint processor

**Example:**

```typescript
import { createProcessor } from "@volar/eslint";
import { ESLint } from "eslint";

const processor = createProcessor(
  [myLanguagePlugin],
  false, // case-insensitive
  {
    typescript: ".ts",
    javascript: ".js",
    css: ".css",
  }
);

const eslint = new ESLint({
  processor: {
    ".vue": processor,
    ".svelte": processor,
  },
});
```

## How It Works

1. **Preprocessing**: The processor extracts virtual code from source files
2. **Linting**: ESLint lints each virtual code file
3. **Postprocessing**: Diagnostics are mapped back to source positions

### Preprocessing

For each source file:

- Creates a `SourceScript` from the file
- Extracts all `VirtualCode` with diagnostics enabled
- Creates ESLint files for each virtual code
- Maps virtual code to source positions

### Postprocessing

For each lint result:

- Maps diagnostic positions from virtual code to source
- Filters out diagnostics that can't be mapped
- Returns merged diagnostics

## Usage Examples

### Basic Setup

```typescript
import { createProcessor } from "@volar/eslint";
import { ESLint } from "eslint";
import { myLanguagePlugin } from "./my-plugin";

const processor = createProcessor([myLanguagePlugin], false);

const eslint = new ESLint({
  useEslintrc: true,
  processor: {
    ".vue": processor,
    ".svelte": processor,
  },
});

// Lint files
const results = await eslint.lintFiles(["**/*.vue"]);
```

### Custom Extension Map

```typescript
const processor = createProcessor([myLanguagePlugin], false, {
  typescript: ".ts",
  typescriptreact: ".tsx",
  javascript: ".js",
  javascriptreact: ".jsx",
  css: ".css",
  scss: ".scss",
  less: ".less",
});
```

### Without Autofix

```typescript
const processor = createProcessor(
  [myLanguagePlugin],
  false,
  undefined,
  false // Disable autofix
);
```

## Integration with Language Plugins

The processor works with any `LanguagePlugin` that:

- Generates `VirtualCode` with `mappings`
- Sets `verification: true` in `CodeInformation` for code that should be linted

```typescript
const myPlugin: LanguagePlugin<string> = {
  createVirtualCode(id, languageId, snapshot, ctx) {
    return {
      id: "script",
      languageId: "typescript",
      snapshot: createSnapshot(generatedCode),
      mappings: [
        {
          sourceOffsets: [0],
          generatedOffsets: [0],
          lengths: [100],
          data: {
            verification: true, // Enable linting
          },
        },
      ],
    };
  },
};
```

## Related Documentation

- [ESLint Documentation](https://eslint.org/docs/)
- [@volar/language-core](../language-core/README.md) - Core language processing
- [ESLint Processors](https://eslint.org/docs/latest/extend/custom-processors)

## See Also

- [@volar/kit](../kit/README.md) - Node.js toolkit with linting support
