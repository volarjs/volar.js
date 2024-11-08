# @volar/test-utils

This module provides a simple way to start a language server and interact with it. It exports a function `startLanguageServer` which starts a language server and returns a handle to interact with it.

## Usage

First, import the module and start the language server:

```typescript
import { startLanguageServer } from '@volar/test-utils';

const serverHandle = startLanguageServer('path/to/server/module');
```

The `startLanguageServer` function takes the path to the server module as a string and optionally a current working directory as a string or URL.

The returned server handle provides several methods to interact with the language server:

- `initialize(rootUri: string, initializationOptions: InitializationOptions)`: Initializes the language server.
- `openTextDocument(fileName: string, languageId: string)`: Opens a text document.
- `openUntitledDocument(languageId: string, content: string)`: Opens an untitled text document.
- `closeTextDocument(uri: string)`: Closes a text document.
- Various `send*Request` methods: Send language-related requests to the server.

For example, to open a text document and send a completion request:

```typescript
await serverHandle.initialize('file:///path/to/workspace', {});
const document = await serverHandle.openTextDocument('path/to/file', 'typescript');
const completions = await serverHandle.sendCompletionRequest(document.uri, { line: 0, character: 0 });
```
