# @volar/test-utils

Testing utilities for Volar.js language servers. Provides helpers for starting language servers, managing documents, and sending LSP requests in tests.

## Overview

`@volar/test-utils` provides:

- **Language Server Testing**: Start and interact with language servers
- **Document Management**: Open, update, and close test documents
- **LSP Request Helpers**: Send all types of LSP requests
- **Snapshot Utilities**: Print and inspect virtual code snapshots

## Installation

```bash
npm install @volar/test-utils
```

## API Reference

### startLanguageServer

Starts a language server process and returns a handle for interaction.

```typescript
function startLanguageServer(
  serverModule: string,
  cwd?: string | URL
): LanguageServerHandle;
```

**Parameters:**

- `serverModule`: Path to server module file
- `cwd`: Current working directory (optional)

**Returns:** Server handle with methods for interaction

**Example:**

```typescript
import { startLanguageServer } from "@volar/test-utils";

const serverHandle = startLanguageServer("./dist/server.js", process.cwd());
```

### Server Handle Methods

#### initialize

Initializes the language server.

```typescript
initialize(
  rootUri: string | WorkspaceFolder[],
  initializationOptions: InitializationOptions,
  capabilities?: ClientCapabilities,
  locale?: string
): Promise<InitializeResult>
```

#### openTextDocument

Opens a text document from a file.

```typescript
openTextDocument(fileName: string, languageId: string): Promise<TextDocument>
```

#### openUntitledDocument

Opens an untitled text document.

```typescript
openUntitledDocument(languageId: string, content: string): Promise<TextDocument>
```

#### closeTextDocument

Closes a text document.

```typescript
closeTextDocument(uri: string): Promise<void>
```

#### sendCompletionRequest

Sends a completion request.

```typescript
sendCompletionRequest(
  uri: string,
  position: Position,
  context?: CompletionContext
): Promise<CompletionList | null>
```

#### Other Request Methods

- `sendHoverRequest(uri, position)`: Get hover information
- `sendDefinitionRequest(uri, position)`: Get definition
- `sendReferencesRequest(uri, position, context)`: Get references
- `sendDiagnosticsRequest(uri)`: Get diagnostics
- `sendDocumentSymbolRequest(uri)`: Get document symbols
- And many more...

## Usage Examples

### Basic Test Setup

```typescript
import { startLanguageServer } from "@volar/test-utils";
import { describe, it, expect, afterEach } from "vitest";

describe("Language Server Tests", () => {
  const serverHandle = startLanguageServer("./dist/server.js");

  afterEach(async () => {
    await serverHandle.shutdown();
  });

  it("should provide completions", async () => {
    await serverHandle.initialize("file:///workspace", {});
    const document = await serverHandle.openTextDocument(
      "./test.ts",
      "typescript"
    );

    const completions = await serverHandle.sendCompletionRequest(document.uri, {
      line: 0,
      character: 10,
    });

    expect(completions).toBeDefined();
    expect(completions?.items.length).toBeGreaterThan(0);
  });
});
```

### Testing Multiple Documents

```typescript
it("should handle multiple documents", async () => {
  await serverHandle.initialize("file:///workspace", {});

  const doc1 = await serverHandle.openTextDocument("./file1.ts", "typescript");
  const doc2 = await serverHandle.openTextDocument("./file2.ts", "typescript");

  const completions1 = await serverHandle.sendCompletionRequest(doc1.uri, {
    line: 0,
    character: 0,
  });

  const completions2 = await serverHandle.sendCompletionRequest(doc2.uri, {
    line: 0,
    character: 0,
  });

  expect(completions1).toBeDefined();
  expect(completions2).toBeDefined();
});
```

### Testing Document Changes

```typescript
it("should handle document changes", async () => {
  await serverHandle.initialize("file:///workspace", {});
  const document = await serverHandle.openTextDocument(
    "./test.ts",
    "typescript"
  );

  // Update document
  await serverHandle.changeTextDocument(document.uri, [
    {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      text: "const x = 1;\n",
    },
  ]);

  // Get diagnostics after change
  const diagnostics = await serverHandle.sendDiagnosticsRequest(document.uri);
  expect(diagnostics).toBeDefined();
});
```

## Testing Patterns

### Pattern: Setup and Teardown

```typescript
describe("Language Server", () => {
  let serverHandle: LanguageServerHandle;

  beforeEach(async () => {
    serverHandle = startLanguageServer("./dist/server.js");
    await serverHandle.initialize("file:///workspace", {});
  });

  afterEach(async () => {
    await serverHandle.shutdown();
  });

  // Tests...
});
```

### Pattern: Test Helper Functions

```typescript
async function createTestDocument(
  serverHandle: LanguageServerHandle,
  content: string,
  languageId: string = "typescript"
) {
  const document = await serverHandle.openUntitledDocument(languageId, content);
  return document;
}

async function getCompletions(
  serverHandle: LanguageServerHandle,
  document: TextDocument,
  line: number,
  character: number
) {
  return await serverHandle.sendCompletionRequest(document.uri, {
    line,
    character,
  });
}
```

### Pattern: Assertion Helpers

```typescript
function assertCompletion(completions: CompletionList | null, label: string) {
  expect(completions).toBeDefined();
  expect(completions?.items).toBeDefined();
  const item = completions?.items.find((item) => item.label === label);
  expect(item).toBeDefined();
  return item;
}

function assertDiagnostic(diagnostics: Diagnostic[] | null, message: string) {
  expect(diagnostics).toBeDefined();
  const diagnostic = diagnostics?.find((d) => d.message.includes(message));
  expect(diagnostic).toBeDefined();
  return diagnostic;
}
```

## Mocking Strategies

### Mock File System

```typescript
import * as fs from "fs";
import { vi } from "vitest";

// Mock file system reads
vi.spyOn(fs, "readFileSync").mockImplementation((path) => {
  if (path === "./test.ts") {
    return "const x = 1;";
  }
  throw new Error("File not found");
});
```

### Mock Configuration

```typescript
// Set configuration in initialization options
await serverHandle.initialize("file:///workspace", {
  typescript: {
    tsdk: "/path/to/typescript",
  },
});
```

### Mock Workspace

```typescript
await serverHandle.initialize(
  [
    { uri: "file:///workspace1", name: "workspace1" },
    { uri: "file:///workspace2", name: "workspace2" },
  ],
  {}
);
```

## Integration Testing

### Testing Language Features

```typescript
describe("Language Features", () => {
  it("should provide hover", async () => {
    const document = await createTestDocument(serverHandle, "const x = 1;");

    const hover = await serverHandle.sendHoverRequest(
      document.uri,
      { line: 0, character: 7 } // Position on 'x'
    );

    expect(hover).toBeDefined();
    expect(hover?.contents).toBeDefined();
  });

  it("should provide definitions", async () => {
    const document = await createTestDocument(
      serverHandle,
      "const x = 1;\nconst y = x;"
    );

    const definitions = await serverHandle.sendDefinitionRequest(
      document.uri,
      { line: 1, character: 9 } // Position on 'x' in second line
    );

    expect(definitions).toBeDefined();
    expect(definitions?.length).toBeGreaterThan(0);
  });
});
```

### Testing Error Cases

```typescript
it("should handle invalid requests gracefully", async () => {
  const document = await createTestDocument(serverHandle, "");

  // Request completion at invalid position
  const completions = await serverHandle.sendCompletionRequest(document.uri, {
    line: 100,
    character: 100,
  });

  // Should return null or empty list, not throw
  expect(completions).toBeDefined();
});
```

## Best Practices

### 1. Always Initialize

Always call `initialize()` before making requests:

```typescript
await serverHandle.initialize("file:///workspace", {});
// Now safe to make requests
```

### 2. Clean Up

Always shutdown the server after tests:

```typescript
afterEach(async () => {
  await serverHandle.shutdown();
});
```

### 3. Use Untitled Documents for Simple Tests

For simple tests, use untitled documents:

```typescript
const document = await serverHandle.openUntitledDocument(
  "typescript",
  "const x = 1;"
);
```

### 4. Test Real Files for Integration

For integration tests, use real files:

```typescript
const document = await serverHandle.openTextDocument(
  "./src/test.ts",
  "typescript"
);
```

### 5. Wait for Operations

Always await async operations:

```typescript
await serverHandle.openTextDocument("./test.ts", "typescript");
// Don't make requests until document is opened
```

## Snapshot Utilities

### printSnapshots

Print virtual code snapshots for debugging:

```typescript
import { printSnapshots } from "@volar/test-utils";

const sourceScript = language.scripts.get(uri);
if (sourceScript) {
  for (const snapshot of printSnapshots(sourceScript)) {
    console.log(snapshot);
  }
}
```

### printSnapshot

Print a single virtual code snapshot:

```typescript
import { printSnapshot } from "@volar/test-utils";

const virtualCode = sourceScript.generated.root;
const snapshot = printSnapshot(sourceScript, virtualCode);
console.log(snapshot);
```

## Related Documentation

- [Testing Guide](../../docs/CONTRIBUTING.md#testing) - Testing guidelines
- [@volar/language-server](../language-server/README.md) - Language server implementation
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) - LSP specification
