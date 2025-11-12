# Using @volar/kit

Guide to using @volar/kit for linting, formatting, and project management in Node.js.

## Overview

`@volar/kit` provides simplified APIs for using Volar.js in Node.js applications.

## Basic Usage

### Creating a Checker

```typescript
import { createTypeScriptChecker } from "@volar/kit";
import { myLanguagePlugin } from "./language-plugin";
import { myServicePlugin } from "./service-plugin";

const [projectHost, languageService] = createTypeScriptChecker(
  [myLanguagePlugin],
  [myServicePlugin],
  "./tsconfig.json"
);
```

### Checking Files

```typescript
for (const fileName of projectHost.getScriptFileNames()) {
  const diagnostics = await languageService.getDiagnostics(URI.file(fileName));

  if (diagnostics && diagnostics.length > 0) {
    console.error(`Errors in ${fileName}:`);
    for (const diagnostic of diagnostics) {
      console.error(`  ${diagnostic.message}`);
    }
  }
}
```

### Formatting Code

```typescript
import { createFormatter } from "@volar/kit";

const formatter = createFormatter([myLanguagePlugin], [myServicePlugin]);

const formatted = await formatter.format("const x=1;", "typescript", {
  tabSize: 2,
  insertSpaces: true,
});

console.log(formatted); // 'const x = 1;'
```

## File Watcher Integration

```typescript
import { watch } from "chokidar";
import { createTypeScriptChecker } from "@volar/kit";

const [projectHost, languageService] = createTypeScriptChecker(
  [myLanguagePlugin],
  [myServicePlugin],
  "./tsconfig.json"
);

watch("**/*.ts").on("change", async (file) => {
  const uri = URI.file(file);
  const diagnostics = await languageService.getDiagnostics(uri);

  if (diagnostics) {
    // Handle diagnostics
  }
});
```

## Complete Example

See the [Kit README](../../packages/kit/README.md) for complete examples.

## Related Documentation

- [@volar/kit](../../packages/kit/README.md) - Kit package documentation
