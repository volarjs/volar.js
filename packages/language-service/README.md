# @volar/language-service

Builds on `@volar/language-core` to provide language service features like IntelliSense, diagnostics, formatting, and more. This package implements 30+ language service features through a plugin-based architecture.

## Overview

`@volar/language-service` provides a complete language service implementation with:

- **30+ Language Features**: Completion, hover, diagnostics, formatting, navigation, and more
- **Plugin System**: Extensible architecture for adding custom language features
- **Feature Worker Pattern**: Efficient processing of language service requests
- **Embedded Document Support**: Handle virtual code and embedded languages
- **Position Mapping**: Automatic translation between source and virtual code positions

## Installation

```bash
npm install @volar/language-service
```

## Core Concepts

### LanguageService

The main service that provides all language features. Created using `createLanguageService()`.

### LanguageServicePlugin

Plugins that provide language service features. Each plugin can implement one or more feature providers.

### LanguageServiceContext

Context provided to plugins, containing:

- Language instance
- Project context
- Document registry
- Environment settings
- Plugin registry
- Dependency injection system

## API Reference

### createLanguageService

Creates a language service instance.

```typescript
function createLanguageService(
  language: Language<URI>,
  plugins: LanguageServicePlugin[],
  env: LanguageServiceEnvironment,
  project: ProjectContext
): LanguageService;
```

**Parameters:**

- `language`: Language instance from `@volar/language-core`
- `plugins`: Array of language service plugins
- `env`: Environment configuration (workspace folders, file system, etc.)
- `project`: Project context

**Returns:** A `LanguageService` instance

**Example:**

```typescript
import { createLanguageService } from "@volar/language-service";
import { createLanguage } from "@volar/language-core";
import { URI } from "vscode-uri";

const language = createLanguage(plugins, registry, sync);
const languageService = createLanguageService(
  language,
  [myServicePlugin],
  {
    workspaceFolders: [URI.parse("file:///")],
  },
  {}
);
```

## Language Service Features

### Completion & IntelliSense

#### getCompletionItems

Provides code completion at a position.

```typescript
getCompletionItems(
  uri: URI,
  position: Position,
  context?: CompletionContext,
  token?: CancellationToken
): Promise<CompletionList | undefined>
```

**Capability:** `completionProvider`

**Example:**

```typescript
const completions = await languageService.getCompletionItems(uri, {
  line: 10,
  character: 5,
});
```

#### getSignatureHelp

Provides signature help (parameter hints) at a position.

```typescript
getSignatureHelp(
  uri: URI,
  position: Position,
  context?: SignatureHelpContext,
  token?: CancellationToken
): Promise<SignatureHelp | undefined>
```

**Capability:** `signatureHelpProvider`

#### getAutoInsertSnippet

Provides auto-insert snippets (e.g., closing tags).

```typescript
getAutoInsertSnippet(
  uri: URI,
  position: Position,
  key: string,
  token?: CancellationToken
): Promise<TextEdit | undefined>
```

**Capability:** `autoInsertionProvider`

### Navigation

#### getDefinition

Finds the definition of a symbol.

```typescript
getDefinition(
  uri: URI,
  position: Position,
  token?: CancellationToken
): Promise<LocationLink[] | undefined>
```

**Capability:** `definitionProvider`

#### getTypeDefinition

Finds the type definition of a symbol.

```typescript
getTypeDefinition(
  uri: URI,
  position: Position,
  token?: CancellationToken
): Promise<LocationLink[] | undefined>
```

**Capability:** `typeDefinitionProvider`

#### getImplementation

Finds implementations of an interface or abstract class.

```typescript
getImplementation(
  uri: URI,
  position: Position,
  token?: CancellationToken
): Promise<LocationLink[] | undefined>
```

**Capability:** `implementationProvider`

#### getDeclaration

Finds the declaration of a symbol.

```typescript
getDeclaration(
  uri: URI,
  position: Position,
  token?: CancellationToken
): Promise<DeclarationLink[] | undefined>
```

**Capability:** `declarationProvider`

#### getReferences

Finds all references to a symbol.

```typescript
getReferences(
  uri: URI,
  position: Position,
  context: ReferenceContext,
  token?: CancellationToken
): Promise<Location[] | undefined>
```

**Capability:** `referencesProvider`

**Example:**

```typescript
const references = await languageService.getReferences(
  uri,
  { line: 10, character: 5 },
  { includeDeclaration: true }
);
```

#### getFileReferences

Finds all references to a file.

```typescript
getFileReferences(
  uri: URI,
  token?: CancellationToken
): Promise<Location[] | undefined>
```

**Capability:** `fileReferencesProvider`

#### getWorkspaceSymbols

Searches for symbols across the workspace.

```typescript
getWorkspaceSymbols(
  query: string,
  token?: CancellationToken
): Promise<WorkspaceSymbol[] | undefined>
```

**Capability:** `workspaceSymbolProvider`

### Semantic Information

#### getHover

Provides hover information at a position.

```typescript
getHover(
  uri: URI,
  position: Position,
  token?: CancellationToken
): Promise<Hover | undefined>
```

**Capability:** `hoverProvider`

**Example:**

```typescript
const hover = await languageService.getHover(uri, { line: 10, character: 5 });
if (hover) {
  console.log(hover.contents);
}
```

#### getDocumentHighlights

Highlights all occurrences of a symbol in a document.

```typescript
getDocumentHighlights(
  uri: URI,
  position: Position,
  token?: CancellationToken
): Promise<DocumentHighlight[] | undefined>
```

**Capability:** `documentHighlightProvider`

#### getSemanticTokens

Provides semantic tokens for syntax highlighting.

```typescript
getSemanticTokens(
  uri: URI,
  range?: Range,
  token?: CancellationToken
): Promise<SemanticTokens | undefined>
```

**Capability:** `semanticTokensProvider`

#### getInlayHints

Provides inlay hints (type annotations, parameter names, etc.).

```typescript
getInlayHints(
  uri: URI,
  range: Range,
  token?: CancellationToken
): Promise<InlayHint[] | undefined>
```

**Capability:** `inlayHintProvider`

#### getCodeLenses

Provides code lenses (references count, etc.).

```typescript
getCodeLenses(
  uri: URI,
  token?: CancellationToken
): Promise<CodeLens[] | undefined>
```

**Capability:** `codeLensProvider`

#### getMoniker

Provides moniker information for symbols.

```typescript
getMoniker(
  uri: URI,
  position: Position,
  token?: CancellationToken
): Promise<Moniker[] | undefined>
```

**Capability:** `monikerProvider`

#### getInlineValue

Provides inline values for debugging.

```typescript
getInlineValue(
  uri: URI,
  range: Range,
  context: InlineValueContext,
  token?: CancellationToken
): Promise<InlineValue[] | undefined>
```

**Capability:** `inlineValueProvider`

### Diagnostics & Actions

#### getDiagnostics

Provides diagnostics (errors, warnings) for a document.

```typescript
getDiagnostics(
  uri: URI,
  token?: CancellationToken
): Promise<Diagnostic[] | undefined>
```

**Capability:** `diagnosticProvider`

**Example:**

```typescript
const diagnostics = await languageService.getDiagnostics(uri);
for (const diagnostic of diagnostics) {
  console.log(`${diagnostic.severity}: ${diagnostic.message}`);
}
```

#### getWorkspaceDiagnostics

Provides diagnostics for all workspace documents.

```typescript
getWorkspaceDiagnostics(
  token?: CancellationToken
): Promise<WorkspaceDocumentDiagnosticReport[] | undefined>
```

**Capability:** `diagnosticProvider.workspaceDiagnostics`

#### getCodeActions

Provides code actions (quick fixes, refactorings) for a range.

```typescript
getCodeActions(
  uri: URI,
  range: Range,
  context: CodeActionContext,
  token?: CancellationToken
): Promise<CodeAction[] | undefined>
```

**Capability:** `codeActionProvider`

**Example:**

```typescript
const codeActions = await languageService.getCodeActions(
  uri,
  { start: { line: 10, character: 0 }, end: { line: 10, character: 10 } },
  { diagnostics: [...] }
);
```

### Editing Support

#### getDocumentFormattingEdits

Formats a document or range.

```typescript
getDocumentFormattingEdits(
  uri: URI,
  range?: Range,
  options?: FormattingOptions,
  token?: CancellationToken
): Promise<TextEdit[] | undefined>
```

**Capability:** `documentFormattingProvider`

**Example:**

```typescript
const edits = await languageService.getDocumentFormattingEdits(uri, undefined, {
  tabSize: 2,
  insertSpaces: true,
});
```

#### getRenameRange

Gets the range that can be renamed at a position.

```typescript
getRenameRange(
  uri: URI,
  position: Position,
  token?: CancellationToken
): Promise<Range | RenameRange | undefined>
```

**Capability:** `renameProvider.prepareProvider`

#### getRenameEdits

Provides edits for renaming a symbol.

```typescript
getRenameEdits(
  uri: URI,
  position: Position,
  newName: string,
  token?: CancellationToken
): Promise<WorkspaceEdit | undefined>
```

**Capability:** `renameProvider`

**Example:**

```typescript
const edits = await languageService.getRenameEdits(
  uri,
  { line: 10, character: 5 },
  "newName"
);
```

#### getFileRenameEdits

Provides edits for renaming a file.

```typescript
getFileRenameEdits(
  oldUri: URI,
  newUri: URI,
  token?: CancellationToken
): Promise<WorkspaceEdit | undefined>
```

**Capability:** `fileRenameEditsProvider`

#### getDocumentDropEdits

Provides edits for dropping content into a document.

```typescript
getDocumentDropEdits(
  uri: URI,
  position: Position,
  dataTransfer: DataTransfer,
  token?: CancellationToken
): Promise<WorkspaceEdit | undefined>
```

**Capability:** `documentDropEditsProvider`

### Structure

#### getDocumentSymbols

Provides document symbols (outline).

```typescript
getDocumentSymbols(
  uri: URI,
  token?: CancellationToken
): Promise<DocumentSymbol[] | undefined>
```

**Capability:** `documentSymbolProvider`

#### getFoldingRanges

Provides folding ranges.

```typescript
getFoldingRanges(
  uri: URI,
  token?: CancellationToken
): Promise<FoldingRange[] | undefined>
```

**Capability:** `foldingRangeProvider`

#### getSelectionRanges

Provides selection ranges for smart selection.

```typescript
getSelectionRanges(
  uri: URI,
  positions: Position[],
  token?: CancellationToken
): Promise<SelectionRange[] | undefined>
```

**Capability:** `selectionRangeProvider`

#### getLinkedEditingRanges

Provides linked editing ranges (e.g., HTML tag pairs).

```typescript
getLinkedEditingRanges(
  uri: URI,
  position: Position,
  token?: CancellationToken
): Promise<LinkedEditingRanges | undefined>
```

**Capability:** `linkedEditingRangeProvider`

### Other Features

#### getDocumentColors

Provides color information in a document.

```typescript
getDocumentColors(
  uri: URI,
  token?: CancellationToken
): Promise<ColorInformation[] | undefined>
```

**Capability:** `colorProvider`

#### getColorPresentations

Provides color presentation for a color value.

```typescript
getColorPresentations(
  uri: URI,
  color: Color,
  range: Range,
  token?: CancellationToken
): Promise<ColorPresentation[] | undefined>
```

**Capability:** `colorProvider`

#### getDocumentLinks

Provides document links.

```typescript
getDocumentLinks(
  uri: URI,
  token?: CancellationToken
): Promise<DocumentLink[] | undefined>
```

**Capability:** `documentLinkProvider`

#### getCallHierarchyItems

Provides call hierarchy items.

```typescript
getCallHierarchyItems(
  uri: URI,
  position: Position,
  token?: CancellationToken
): Promise<CallHierarchyItem[] | undefined>
```

**Capability:** `callHierarchyProvider`

### Resolve Methods

Some features support lazy resolution:

- `resolveCodeAction(codeAction, token)`: Resolves a code action
- `resolveCompletionItem(item, token)`: Resolves a completion item
- `resolveCodeLens(codeLens, token)`: Resolves a code lens
- `resolveDocumentLink(link, token)`: Resolves a document link
- `resolveInlayHint(hint, token)`: Resolves an inlay hint
- `resolveWorkspaceSymbol(symbol, token)`: Resolves a workspace symbol

## Creating a LanguageServicePlugin

### Basic Plugin Structure

```typescript
import type {
  LanguageServicePlugin,
  LanguageServicePluginInstance,
} from "@volar/language-service";

const myPlugin: LanguageServicePlugin = {
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
                kind: 1, // Text
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

### Using Dependency Injection

Plugins can inject dependencies to other plugins:

```typescript
const myPlugin: LanguageServicePlugin = {
  name: "my-plugin",
  capabilities: {
    /* ... */
  },
  create(context) {
    // Inject a dependency
    const otherService = context.inject("myService", arg1, arg2);

    return {
      provide: {
        // Use the injected service
        provideHover(document, position, token) {
          return otherService?.getHover(document, position);
        },
      },
    };
  },
};
```

### Feature Worker Pattern

The language service uses a "feature worker" pattern that automatically:

- Maps positions between source and virtual code
- Iterates over plugins
- Merges results from multiple plugins
- Handles cancellation tokens

Plugins just need to implement the provider functions - the framework handles the rest.

## Embedded Document URI System

Virtual codes are accessed via embedded document URIs:

```typescript
// Encode embedded document URI
const embeddedUri = context.encodeEmbeddedDocumentUri(sourceUri, virtualCodeId);

// Decode embedded document URI
const [documentUri, embeddedCodeId] =
  context.decodeEmbeddedDocumentUri(embeddedUri);
```

The scheme for embedded documents is `volar-embedded-content`.

## Examples

### Complete Plugin Example

```typescript
import type {
  LanguageServicePlugin,
  LanguageServicePluginInstance,
  LanguageServiceContext,
} from "@volar/language-service";
import type * as vscode from "vscode-languageserver-protocol";

const myLanguagePlugin: LanguageServicePlugin = {
  name: "my-language",
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
          // Check if position is in our language
          const text = document.getText();
          const offset = document.offsetAt(position);

          // Provide hover
          return {
            contents: {
              kind: "markdown",
              value: `Hover at position ${offset}`,
            },
          };
        },

        provideCompletionItems(document, position, context, token) {
          return {
            isIncomplete: false,
            items: [
              {
                label: "snippet",
                kind: 15, // Snippet
                insertText: "snippet($1)",
                insertTextFormat: 2, // SnippetFormat
              },
            ],
          };
        },

        provideDiagnostics(document, token) {
          const diagnostics: vscode.Diagnostic[] = [];
          const text = document.getText();

          // Check for errors
          if (text.includes("error")) {
            diagnostics.push({
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 5 },
              },
              severity: 1, // Error
              message: "Found error keyword",
            });
          }

          return diagnostics;
        },
      },
    };
  },
};
```

## Related Documentation

- [Architecture Guide](../../docs/ARCHITECTURE.md) - System architecture
- [Plugin System](../../docs/PLUGINS.md) - Plugin development guide
- [Data Flow](../../docs/DATA_FLOW.md) - Request flow explanation
- [@volar/language-core](../language-core/README.md) - Core language processing

## See Also

- [@volar/language-server](../language-server/README.md) - LSP server implementation
- [@volar/kit](../kit/README.md) - Node.js toolkit
