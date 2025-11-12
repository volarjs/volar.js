# @volar/jsdelivr

jsDelivr CDN integration for Volar.js. Provides a file system implementation that fetches NPM packages from jsDelivr CDN, enabling Auto Type Acquisition (ATA) in browser environments.

## Overview

`@volar/jsdelivr` provides:

- **NPM File System**: File system implementation that fetches packages from jsDelivr
- **Auto Type Acquisition**: Automatically fetch TypeScript type definitions
- **CDN Integration**: Seamless integration with jsDelivr CDN

## Installation

```bash
npm install @volar/jsdelivr
```

## API Reference

### createNpmFileSystem

Creates a file system that fetches NPM packages from jsDelivr CDN.

```typescript
function createNpmFileSystem(
  getCdnPath?: (uri: URI) => string | undefined,
  getPackageVersion?: (pkgName: string) => string | undefined,
  onFetch?: (path: string, content: string) => void
): FileSystem;
```

**Parameters:**

- `getCdnPath`: Function to convert URI to CDN path (optional)
- `getPackageVersion`: Function to get package version (optional)
- `onFetch`: Callback when files are fetched (optional)

**Returns:** A `FileSystem` implementation

**Example:**

```typescript
import { createNpmFileSystem } from "@volar/jsdelivr";
import { URI } from "vscode-uri";

const fs = createNpmFileSystem(
  (uri) => {
    // Convert URI to CDN path
    if (uri.path.startsWith("/node_modules/")) {
      return uri.path.slice("/node_modules/".length);
    }
  },
  (pkgName) => {
    // Get package version (e.g., from package.json)
    return "latest";
  },
  (path, content) => {
    console.log(`Fetched ${path}`);
  }
);
```

## Usage Examples

### Basic Setup

```typescript
import { createNpmFileSystem } from "@volar/jsdelivr";
import { createLanguageService } from "@volar/language-service";
import { URI } from "vscode-uri";

const fs = createNpmFileSystem();

const languageService = createLanguageService(
  language,
  plugins,
  {
    workspaceFolders: [URI.parse("file:///")],
    fs, // Use jsDelivr file system
  },
  {}
);
```

### Custom CDN Path Mapping

```typescript
const fs = createNpmFileSystem((uri) => {
  // Custom path mapping
  const path = uri.path;
  if (path === "/node_modules") {
    return "";
  }
  if (path.startsWith("/node_modules/")) {
    // Extract package path
    const packagePath = path.slice("/node_modules/".length);
    return packagePath;
  }
  return undefined;
});
```

### Package Version Resolution

```typescript
const packageVersions = new Map<string, string>();

const fs = createNpmFileSystem(undefined, (pkgName) => {
  // Resolve package version
  return packageVersions.get(pkgName) || "latest";
});

// Set package versions
packageVersions.set("typescript", "5.0.0");
packageVersions.set("vue", "3.3.0");
```

### With Fetch Callback

```typescript
const fetchedFiles = new Set<string>();

const fs = createNpmFileSystem(undefined, undefined, (path, content) => {
  fetchedFiles.add(path);
  console.log(`Fetched ${path} (${content.length} bytes)`);
});
```

## Auto Type Acquisition (ATA)

When used with TypeScript language service, the file system automatically fetches type definitions:

1. TypeScript requests a type definition file (e.g., `@types/node`)
2. File system checks if it's in `/node_modules/`
3. If found, fetches from jsDelivr CDN
4. Caches the result for future requests

### Example: ATA in Monaco Editor

```typescript
import { createNpmFileSystem } from "@volar/jsdelivr";
import { createTypeScriptWorkerLanguageService } from "@volar/monaco/worker";

const env = {
  workspaceFolders: [URI.parse("file:///")],
  fs: createNpmFileSystem(), // Enable ATA
};

const languageService = createTypeScriptWorkerLanguageService({
  typescript: ts,
  env,
  // ... other options
});
```

## CDN Structure

The file system expects URIs in the format:

- `/node_modules` - Root of node_modules
- `/node_modules/package-name` - Package root
- `/node_modules/package-name/file.js` - Package file

Files are fetched from jsDelivr using the format:

- `https://cdn.jsdelivr.net/npm/package-name@version/file`

## Caching

The file system caches:

- File contents (text cache)
- JSON responses (JSON cache)
- Directory listings (flat results cache)

Caches are shared across all instances and persist for the lifetime of the application.

## Related Documentation

- [jsDelivr CDN](https://www.jsdelivr.com/)
- [Auto Type Acquisition](https://www.typescriptlang.org/docs/handbook/type-acquisition.html)
- [@volar/monaco](../monaco/README.md) - Monaco Editor integration with ATA

## See Also

- [@volar/language-service](../language-service/README.md) - Language service with file system support
- [@volar/typescript](../typescript/README.md) - TypeScript integration
