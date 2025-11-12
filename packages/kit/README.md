# @volar/kit

Node.js application toolkit for Volar.js. Provides simplified APIs for linting, formatting, and project management in Node.js environments.

## Overview

`@volar/kit` provides:

- **TypeScript Checker**: Type checking with TypeScript project support
- **Formatter**: Code formatting with language service plugins
- **Project Management**: Create and manage TypeScript projects
- **Service Environment**: Node.js-specific service environment setup

## Installation

```bash
npm install @volar/kit
```

## API Reference

### createTypeScriptChecker

Creates a TypeScript checker with tsconfig.json support.

```typescript
function createTypeScriptChecker(
  languagePlugins: LanguagePlugin<URI>[],
  languageServicePlugins: LanguageServicePlugin[],
  tsconfig: string,
  includeProjectReference?: boolean,
  setup?: (options: { language: Language; project: ProjectContext }) => void
): [TypeScriptProjectHost, LanguageService];
```

**Parameters:**

- `languagePlugins`: Array of language plugins
- `languageServicePlugins`: Array of language service plugins
- `tsconfig`: Path to tsconfig.json file
- `includeProjectReference`: Include project references (default: false)
- `setup`: Optional setup callback

**Returns:** Tuple of `[projectHost, languageService]`

**Example:**

```typescript
import { createTypeScriptChecker } from "@volar/kit";
import { URI } from "vscode-uri";

const [projectHost, languageService] = createTypeScriptChecker(
  [myLanguagePlugin],
  [myServicePlugin],
  "./tsconfig.json",
  false,
  ({ language, project }) => {
    // Custom setup
  }
);
```

### createTypeScriptInferredChecker

Creates a TypeScript checker without tsconfig.json (inferred project).

```typescript
function createTypeScriptInferredChecker(
  languagePlugins: LanguagePlugin<URI>[],
  languageServicePlugins: LanguageServicePlugin[],
  getScriptFileNames: () => string[],
  compilerOptions?: ts.CompilerOptions,
  setup?: (options: { language: Language; project: ProjectContext }) => void
): [TypeScriptProjectHost, LanguageService];
```

**Parameters:**

- `languagePlugins`: Array of language plugins
- `languageServicePlugins`: Array of language service plugins
- `getScriptFileNames`: Function that returns array of file names
- `compilerOptions`: TypeScript compiler options (optional)
- `setup`: Optional setup callback

**Returns:** Tuple of `[projectHost, languageService]`

**Example:**

```typescript
import { createTypeScriptInferredChecker } from "@volar/kit";

const [projectHost, languageService] = createTypeScriptInferredChecker(
  [myLanguagePlugin],
  [myServicePlugin],
  () => ["src/file1.ts", "src/file2.ts"],
  { target: ts.ScriptTarget.ES2020 }
);
```

### createFormatter

Creates a code formatter.

```typescript
function createFormatter(
  languages: LanguagePlugin<URI>[],
  services: LanguageServicePlugin[]
): {
  env: LanguageServiceEnvironment;
  format: (
    content: string,
    languageId: string,
    options: FormattingOptions
  ) => Promise<string>;
  settings: any;
};
```

**Parameters:**

- `languages`: Array of language plugins
- `services`: Array of language service plugins

**Returns:** Formatter object with `format` method and `settings`

**Example:**

```typescript
import { createFormatter } from "@volar/kit";

const formatter = createFormatter([myLanguagePlugin], [myServicePlugin]);

// Format code
const formatted = await formatter.format("const x=1;", "typescript", {
  tabSize: 2,
  insertSpaces: true,
});
```

### createServiceEnvironment

Creates a service environment for Node.js.

```typescript
function createServiceEnvironment(
  getSettings: () => any
): LanguageServiceEnvironment;
```

**Parameters:**

- `getSettings`: Function that returns settings object

**Returns:** Language service environment

## Example: Use FileWatcher

```ts
import * as fs from "fs";
import * as path from "path";
import { watch } from "chokidar";
import * as kit from "@volar/kit";

const tsconfig = getTsconfig();
const project = kit.createProject(tsconfig, [
  { extension: "foo", isMixedContent: true, scriptKind: 7 },
]);
const config: kit.Config = {
  languages: {
    // ...
  },
  services: {
    // ...
  },
};
const linter = kit.createLinter(config, project.languageServiceHost);

let req = 0;

update();

createWatcher(path.dirname(tsconfig), ["ts", "js", "foo"])
  .on("add", (fileName) => {
    project.fileCreated(fileName);
    update();
  })
  .on("unlink", (fileName) => {
    project.fileDeleted(fileName);
    update();
  })
  .on("change", (fileName) => {
    project.fileUpdated(fileName);
    update();
  });

function createWatcher(rootPath: string, extension: string[]) {
  return watch(`${rootPath}/**/*.{${extension.join(",")}}`, {
    ignored: (path) => path.includes("node_modules"),
    ignoreInitial: true,
  });
}

async function update() {
  const currentReq = ++req;
  const isCanceled = () => currentReq !== req;
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (isCanceled()) return;

  process.stdout.write("\x1Bc"); // clear console

  let hasError = false;
  for (const fileName of project.languageServiceHost.getScriptFileNames()) {
    const errors = await linter.check(fileName);
    if (isCanceled()) return;
    if (errors.length) {
      linter.logErrors(fileName, errors);
      hasError = true;
    }
  }
  if (!hasError) {
    console.log("No errors");
  }
}

function getTsconfig() {
  let tsconfig = path.resolve(process.cwd(), "./tsconfig.json");

  const tsconfigIndex = process.argv.indexOf("--tsconfig");
  if (tsconfigIndex >= 0) {
    tsconfig = path.resolve(process.cwd(), process.argv[tsconfigIndex + 1]);
  }

  if (!fs.existsSync(tsconfig)) {
    throw `tsconfig.json not found: ${tsconfig}`;
  }

  return tsconfig;
}
```

## Create Project without tsconfig.json

```ts
const rootPath = process.cwd();
const fileNames = [
  path.resolve(rootPath, "./src/a.ts"),
  path.resolve(rootPath, "./src/b.js"),
  path.resolve(rootPath, "./src/c.foo"),
];
const project = kit.createInferredProject(rootPath, fileNames);
```
