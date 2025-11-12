# Creating a Custom Language Service Plugin

Guide to creating a `LanguageServicePlugin` that provides language features.

## Overview

This guide shows how to create a `LanguageServicePlugin` that provides completion, hover, and diagnostics.

## Step 1: Define Plugin Structure

```typescript
import type {
  LanguageServicePlugin,
  LanguageServicePluginInstance,
} from "@volar/language-service";

const myServicePlugin: LanguageServicePlugin = {
  name: "my-plugin",
  capabilities: {
    // Declare capabilities
  },
  create(context) {
    // Return plugin instance
  },
};
```

## Step 2: Declare Capabilities

Declare which features your plugin provides:

```typescript
capabilities: {
  hoverProvider: true,
  completionProvider: {
    triggerCharacters: ['.']
  },
  diagnosticProvider: {
    interFileDependencies: false,
    workspaceDiagnostics: false
  }
}
```

## Step 3: Implement Feature Providers

Implement the feature providers:

```typescript
create(context: LanguageServiceContext): LanguageServicePluginInstance {
  return {
    provide: {
      provideHover(document, position, token) {
        // Provide hover information
        const text = document.getText();
        const offset = document.offsetAt(position);

        // Simple hover example
        return {
          contents: {
            kind: 'markdown',
            value: `Position: ${offset}`
          }
        };
      },

      provideCompletionItems(document, position, context, token) {
        // Provide completions
        return {
          isIncomplete: false,
          items: [
            {
              label: 'myCompletion',
              kind: 1, // Text
              insertText: 'myCompletion'
            }
          ]
        };
      },

      provideDiagnostics(document, token) {
        // Provide diagnostics
        const diagnostics = [];
        const text = document.getText();

        if (text.includes('error')) {
          diagnostics.push({
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 }
            },
            severity: 1, // Error
            message: 'Found error keyword'
          });
        }

        return diagnostics;
      }
    }
  };
}
```

## Complete Example

```typescript
import type {
  LanguageServicePlugin,
  LanguageServicePluginInstance,
  LanguageServiceContext,
} from "@volar/language-service";
import type * as vscode from "vscode-languageserver-protocol";

const myServicePlugin: LanguageServicePlugin = {
  name: "my-language-service",
  capabilities: {
    hoverProvider: true,
    completionProvider: {
      triggerCharacters: [".", "("],
    },
    diagnosticProvider: {
      interFileDependencies: false,
      workspaceDiagnostics: false,
    },
  },
  create(context: LanguageServiceContext): LanguageServicePluginInstance {
    return {
      provide: {
        provideHover(document, position, token) {
          const text = document.getText();
          const word = getWordAtPosition(text, document.offsetAt(position));

          if (word) {
            return {
              contents: {
                kind: "markdown",
                value: `**${word}**\n\nHover information for ${word}`,
              },
            };
          }
        },

        provideCompletionItems(document, position, context, token) {
          const items: vscode.CompletionItem[] = [
            {
              label: "myFunction",
              kind: 2, // Method
              insertText: "myFunction($1)",
              insertTextFormat: 2, // SnippetFormat
              documentation: "My custom function",
            },
          ];

          return {
            isIncomplete: false,
            items,
          };
        },

        provideDiagnostics(document, token) {
          const diagnostics: vscode.Diagnostic[] = [];
          const text = document.getText();
          const lines = text.split("\n");

          lines.forEach((line, index) => {
            if (line.includes("TODO")) {
              diagnostics.push({
                range: {
                  start: { line: index, character: 0 },
                  end: { line: index, character: line.length },
                },
                severity: 2, // Warning
                message: "TODO comment found",
                source: "my-plugin",
              });
            }
          });

          return diagnostics;
        },
      },
    };
  },
};

function getWordAtPosition(text: string, offset: number): string | undefined {
  // Simple word extraction
  const start = text.lastIndexOf(" ", offset) + 1;
  const end = text.indexOf(" ", offset);
  if (end === -1) return text.substring(start);
  return text.substring(start, end);
}
```

## Using the Plugin

```typescript
import { createLanguageService } from "@volar/language-service";

const languageService = createLanguageService(
  language,
  [myServicePlugin],
  {
    workspaceFolders: [URI.parse("file:///")],
  },
  {}
);

// Use the service
const hover = await languageService.getHover(uri, position);
const completions = await languageService.getCompletionItems(uri, position);
const diagnostics = await languageService.getDiagnostics(uri);
```

## Advanced: Dependency Injection

Use dependency injection to access other services:

```typescript
create(context) {
  // Inject TypeScript language service
  const tsService = context.inject('typescript/languageService');

  return {
    provide: {
      provideHover(document, position, token) {
        // Use TypeScript service
        if (tsService) {
          return tsService.getHover(document, position);
        }
        // Fallback
        return { contents: { kind: 'markdown', value: 'No hover' } };
      }
    }
  };
}
```

## Related Documentation

- [Plugin System Guide](../PLUGINS.md) - Plugin development guide
- [@volar/language-service](../../packages/language-service/README.md) - Service API reference
