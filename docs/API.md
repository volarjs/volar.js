# API Reference

Complete API reference for all Volar.js packages, organized by package with type definitions, function signatures, and cross-references.

## Table of Contents

- [@volar/language-core](#volarlanguage-core)
- [@volar/language-service](#volarlanguage-service)
- [@volar/language-server](#volarlanguage-server)
- [@volar/vscode](#volarvscode)
- [@volar/monaco](#volarmonaco)
- [@volar/kit](#volarkit)
- [@volar/typescript](#volartypescript)
- [@volar/source-map](#volarsource-map)
- [@volar/test-utils](#volartest-utils)
- [@volar/eslint](#volareslint)
- [@volar/jsdelivr](#volarjsdelivr)

## @volar/language-core

### Functions

#### createLanguage

```typescript
function createLanguage<T>(
  plugins: LanguagePlugin<T>[],
  scriptRegistry: Map<T, SourceScript<T>>,
  sync: (id: T, includeFsFiles: boolean, shouldRegister: boolean) => void,
  onAssociationDirty?: (targetId: T) => void
): Language<T>;
```

Creates a language instance for managing language processing.

**Parameters:**

- `plugins`: Array of language plugins
- `scriptRegistry`: Map to store source scripts
- `sync`: Function to synchronize scripts
- `onAssociationDirty`: Optional callback when associations become dirty

**Returns:** `Language<T>` instance

**See also:** [LanguagePlugin](#languageplugin), [SourceScript](#sourcescript)

---

#### forEachEmbeddedCode

```typescript
function* forEachEmbeddedCode(virtualCode: VirtualCode): Generator<VirtualCode>;
```

Recursively iterates over all embedded codes in a virtual code.

**Parameters:**

- `virtualCode`: Virtual code to iterate

**Returns:** Generator yielding all embedded codes

---

### Types

#### Language

```typescript
interface Language<T = unknown> {
  mapperFactory: MapperFactory;
  plugins: LanguagePlugin<T>[];
  scripts: {
    get(
      id: T,
      includeFsFiles?: boolean,
      shouldRegister?: boolean
    ): SourceScript<T> | undefined;
    set(
      id: T,
      snapshot: IScriptSnapshot,
      languageId?: string,
      plugins?: LanguagePlugin<T>[]
    ): SourceScript<T> | undefined;
    delete(id: T): void;
    fromVirtualCode(virtualCode: VirtualCode): SourceScript<T>;
  };
  maps: {
    get(virtualCode: VirtualCode, sourceScript: SourceScript<T>): Mapper;
    forEach(virtualCode: VirtualCode): Generator<[SourceScript<T>, Mapper]>;
  };
  linkedCodeMaps: {
    get(virtualCode: VirtualCode): LinkedCodeMap | undefined;
  };
}
```

Main language instance interface.

---

#### LanguagePlugin

```typescript
interface LanguagePlugin<T = unknown, K extends VirtualCode = VirtualCode> {
  getLanguageId(scriptId: T): string | undefined;
  createVirtualCode?(
    scriptId: T,
    languageId: string,
    snapshot: IScriptSnapshot,
    ctx: CodegenContext<T>
  ): K | undefined;
  updateVirtualCode?(
    scriptId: T,
    virtualCode: K,
    newSnapshot: IScriptSnapshot,
    ctx: CodegenContext<T>
  ): K | undefined;
  disposeVirtualCode?(scriptId: T, virtualCode: K): void;
  isAssociatedFileOnly?(scriptId: T, languageId: string): boolean;
}
```

Plugin interface for transforming source files to virtual code.

---

#### VirtualCode

```typescript
interface VirtualCode {
  id: string;
  languageId: string;
  snapshot: IScriptSnapshot;
  mappings: CodeMapping[];
  associatedScriptMappings?: Map<unknown, CodeMapping[]>;
  embeddedCodes?: VirtualCode[];
  linkedCodeMappings?: Mapping[];
}
```

Generated code representation.

---

#### SourceScript

```typescript
interface SourceScript<T = unknown> {
  id: T;
  languageId: string;
  snapshot: IScriptSnapshot;
  targetIds: Set<T>;
  associatedIds: Set<T>;
  associatedOnly: boolean;
  isAssociationDirty?: boolean;
  generated?: {
    root: VirtualCode;
    languagePlugin: LanguagePlugin<T>;
    embeddedCodes: Map<string, VirtualCode>;
  };
}
```

Source file representation.

---

#### CodeInformation

```typescript
interface CodeInformation {
  verification?:
    | boolean
    | {
        shouldReport?(
          source: string | undefined,
          code: string | number | undefined
        ): boolean;
      };
  completion?: boolean | { isAdditional?: boolean; onlyImport?: boolean };
  semantic?: boolean | { shouldHighlight?(): boolean };
  navigation?:
    | boolean
    | {
        shouldHighlight?(): boolean;
        shouldRename?(): boolean;
        resolveRenameNewName?(newName: string): string;
        resolveRenameEditText?(newText: string): string;
      };
  structure?: boolean;
  format?: boolean;
}
```

Controls which language features are enabled for code regions.

---

#### Mapper

```typescript
interface Mapper {
  mappings: Mapping<CodeInformation>[];
  toSourceRange(
    start: number,
    end: number,
    fallbackToAnyMatch: boolean,
    filter?: (data: CodeInformation) => boolean
  ): Generator<
    readonly [
      number,
      number,
      Mapping<CodeInformation>,
      Mapping<CodeInformation>
    ]
  >;
  toGeneratedRange(
    start: number,
    end: number,
    fallbackToAnyMatch: boolean,
    filter?: (data: CodeInformation) => boolean
  ): Generator<
    readonly [
      number,
      number,
      Mapping<CodeInformation>,
      Mapping<CodeInformation>
    ]
  >;
  toSourceLocation(
    generatedOffset: number,
    filter?: (data: CodeInformation) => boolean
  ): Generator<readonly [number, Mapping<CodeInformation>]>;
  toGeneratedLocation(
    sourceOffset: number,
    filter?: (data: CodeInformation) => boolean
  ): Generator<readonly [number, Mapping<CodeInformation>]>;
}
```

Translates positions between source and virtual code.

---

## @volar/language-service

### Functions

#### createLanguageService

```typescript
function createLanguageService(
  language: Language<URI>,
  plugins: LanguageServicePlugin[],
  env: LanguageServiceEnvironment,
  project: ProjectContext
): LanguageService;
```

Creates a language service instance.

**Parameters:**

- `language`: Language instance
- `plugins`: Array of language service plugins
- `env`: Environment configuration
- `project`: Project context

**Returns:** `LanguageService` instance

---

### LanguageService Methods

#### getCompletionItems

```typescript
getCompletionItems(
  uri: URI,
  position: Position,
  context?: CompletionContext,
  token?: CancellationToken
): Promise<CompletionList | undefined>
```

Provides code completion at a position.

---

#### getHover

```typescript
getHover(
  uri: URI,
  position: Position,
  token?: CancellationToken
): Promise<Hover | undefined>
```

Provides hover information at a position.

---

#### getDiagnostics

```typescript
getDiagnostics(
  uri: URI,
  token?: CancellationToken
): Promise<Diagnostic[] | undefined>
```

Provides diagnostics for a document.

---

#### getDefinition

```typescript
getDefinition(
  uri: URI,
  position: Position,
  token?: CancellationToken
): Promise<LocationLink[] | undefined>
```

Finds the definition of a symbol.

---

#### getReferences

```typescript
getReferences(
  uri: URI,
  position: Position,
  context: ReferenceContext,
  token?: CancellationToken
): Promise<Location[] | undefined>
```

Finds all references to a symbol.

---

#### getDocumentFormattingEdits

```typescript
getDocumentFormattingEdits(
  uri: URI,
  range?: Range,
  options?: FormattingOptions,
  token?: CancellationToken
): Promise<TextEdit[] | undefined>
```

Formats a document or range.

---

#### getRenameEdits

```typescript
getRenameEdits(
  uri: URI,
  position: Position,
  newName: string,
  token?: CancellationToken
): Promise<WorkspaceEdit | undefined>
```

Provides edits for renaming a symbol.

---

**Note:** See [@volar/language-service README](../packages/language-service/README.md) for complete list of 30+ language service methods.

---

### Types

#### LanguageServicePlugin

```typescript
interface LanguageServicePlugin<P = any> {
  name?: string;
  capabilities: {
    hoverProvider?: boolean;
    completionProvider?: {
      triggerCharacters?: string[];
      resolveProvider?: boolean;
    };
    diagnosticProvider?: {
      interFileDependencies: boolean;
      workspaceDiagnostics: boolean;
    };
    // ... many more capabilities
  };
  create(context: LanguageServiceContext): LanguageServicePluginInstance<P>;
}
```

Plugin interface for providing language service features.

---

#### LanguageServiceContext

```typescript
interface LanguageServiceContext {
  language: Language<URI>;
  project: ProjectContext;
  getLanguageService(): LanguageService;
  env: LanguageServiceEnvironment;
  inject<Provide = any, K extends keyof Provide = keyof Provide>(
    key: K,
    ...args: Provide[K] extends (...args: any) => any
      ? Parameters<Provide[K]>
      : never
  ):
    | ReturnType<Provide[K] extends (...args: any) => any ? Provide[K] : never>
    | undefined;
  commands: {
    showReferences: LanguageServiceCommand<
      [uri: string, position: Position, locations: Location[]]
    >;
    rename: LanguageServiceCommand<[uri: string, position: Position]>;
    setSelection: LanguageServiceCommand<[position: Position]>;
  };
  documents: {
    get(uri: URI, languageId: string, snapshot: IScriptSnapshot): TextDocument;
  };
  plugins: [LanguageServicePlugin, LanguageServicePluginInstance][];
  disabledEmbeddedDocumentUris: UriMap<boolean>;
  disabledServicePlugins: WeakSet<LanguageServicePluginInstance>;
  decodeEmbeddedDocumentUri(
    maybeEmbeddedUri: URI
  ): [documentUri: URI, embeddedCodeId: string] | undefined;
  encodeEmbeddedDocumentUri(uri: URI, embeddedCodeId: string): URI;
}
```

Context provided to language service plugins.

---

## @volar/language-server

### Functions

#### createServerBase

```typescript
function createServerBase(
  connection: Connection,
  env: LanguageServerEnvironment
): LanguageServerBase;
```

Creates a base server instance.

---

#### createTypeScriptProject

```typescript
function createTypeScriptProject(
  ts: typeof import("typescript"),
  tsLocalized: ts.MapLike<string> | undefined,
  create: (projectContext: ProjectExposeContext) => ProviderResult<{
    languagePlugins: LanguagePlugin<URI>[];
    setup?: (options: { language: Language; project: ProjectContext }) => void;
  }>
): LanguageServerProject;
```

Creates a TypeScript project.

---

#### createSimpleProject

```typescript
function createSimpleProject(
  languagePlugins: LanguagePlugin<URI>[]
): LanguageServerProject;
```

Creates a simple project without TypeScript.

---

## @volar/vscode

### Functions

#### activateAutoInsertion

```typescript
function activateAutoInsertion(
  client: LanguageClient,
  documentSelector: DocumentSelector
): Disposable;
```

Activates auto-insertion feature.

---

#### activateDocumentDropEdit

```typescript
function activateDocumentDropEdit(
  client: LanguageClient,
  documentSelector: DocumentSelector
): Disposable;
```

Activates document drop edit feature.

---

## @volar/monaco

### Functions

#### createSimpleWorkerLanguageService

```typescript
function createSimpleWorkerLanguageService({
  env,
  workerContext,
  languagePlugins,
  languageServicePlugins,
  setup?
}: {
  env: LanguageServiceEnvironment;
  workerContext: monaco.worker.IWorkerContext<any>;
  languagePlugins: LanguagePlugin<URI>[];
  languageServicePlugins: LanguageServicePlugin[];
  setup?: (options: { language: Language; project: ProjectContext }) => void;
}): WorkerLanguageService
```

Creates a simple worker language service.

---

#### createTypeScriptWorkerLanguageService

```typescript
function createTypeScriptWorkerLanguageService({
  typescript,
  compilerOptions,
  env,
  uriConverter,
  workerContext,
  languagePlugins,
  languageServicePlugins,
  setup?
}: {
  typescript: typeof import('typescript');
  compilerOptions: ts.CompilerOptions;
  env: LanguageServiceEnvironment;
  uriConverter: { asUri(fileName: string): URI; asFileName(uri: URI): string };
  workerContext: monaco.worker.IWorkerContext<any>;
  languagePlugins: LanguagePlugin<URI>[];
  languageServicePlugins: LanguageServicePlugin[];
  setup?: (options: { language: Language; project: ProjectContext }) => void;
}): WorkerLanguageService
```

Creates a TypeScript worker language service.

---

## @volar/kit

### Functions

#### createTypeScriptChecker

```typescript
function createTypeScriptChecker(
  languagePlugins: LanguagePlugin<URI>[],
  languageServicePlugins: LanguageServicePlugin[],
  tsconfig: string,
  includeProjectReference?: boolean,
  setup?: (options: { language: Language; project: ProjectContext }) => void
): [TypeScriptProjectHost, LanguageService];
```

Creates a TypeScript checker with tsconfig.json support.

---

#### createTypeScriptInferredChecker

```typescript
function createTypeScriptInferredChecker(
  languagePlugins: LanguagePlugin<URI>[],
  languageServicePlugins: LanguageServicePlugin[],
  getScriptFileNames: () => string[],
  compilerOptions?: ts.CompilerOptions,
  setup?: (options: { language: Language; project: ProjectContext }) => void
): [TypeScriptProjectHost, LanguageService];
```

Creates a TypeScript checker without tsconfig.json.

---

#### createFormatter

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

Creates a code formatter.

---

## @volar/typescript

### Types

#### TypeScriptServiceScript

```typescript
interface TypeScriptServiceScript {
  code: VirtualCode;
  extension:
    | ".ts"
    | ".js"
    | ".mts"
    | ".mjs"
    | ".cjs"
    | ".cts"
    | ".d.ts"
    | string;
  scriptKind: ts.ScriptKind;
  preventLeadingOffset?: boolean;
}
```

Represents a virtual code that can be used as a TypeScript service script.

---

## @volar/source-map

### Classes

#### SourceMap

```typescript
class SourceMap<Data = unknown> {
  constructor(public readonly mappings: Mapping<Data>[]);
  toSourceRange(generatedStart: number, generatedEnd: number, fallbackToAnyMatch: boolean, filter?: (data: Data) => boolean): Generator<...>;
  toGeneratedRange(sourceStart: number, sourceEnd: number, fallbackToAnyMatch: boolean, filter?: (data: Data) => boolean): Generator<...>;
  toSourceLocation(generatedOffset: number, filter?: (data: Data) => boolean): Generator<...>;
  toGeneratedLocation(sourceOffset: number, filter?: (data: Data) => boolean): Generator<...>;
}
```

Source map class for translating positions.

---

## @volar/test-utils

### Functions

#### startLanguageServer

```typescript
function startLanguageServer(
  serverModule: string,
  cwd?: string | URL
): LanguageServerHandle;
```

Starts a language server process for testing.

---

## @volar/eslint

### Functions

#### createProcessor

```typescript
function createProcessor(
  languagePlugins: LanguagePlugin<string>[],
  caseSensitive: boolean,
  extensionsMap?: Record<string, string>,
  supportsAutofix?: boolean
): Linter.Processor;
```

Creates an ESLint processor for virtual code.

---

## @volar/jsdelivr

### Functions

#### createNpmFileSystem

```typescript
function createNpmFileSystem(
  getCdnPath?: (uri: URI) => string | undefined,
  getPackageVersion?: (pkgName: string) => string | undefined,
  onFetch?: (path: string, content: string) => void
): FileSystem;
```

Creates a file system that fetches NPM packages from jsDelivr CDN.

---

## Cross-References

### Related Types

- `LanguagePlugin` → creates → `VirtualCode`
- `VirtualCode` → contains → `CodeMapping` → contains → `CodeInformation`
- `LanguageServicePlugin` → processes → `VirtualCode`
- `Mapper` → translates → positions between source and virtual code

### Related Functions

- `createLanguage()` → used by → `createLanguageService()`
- `createLanguageService()` → used by → `createTypeScriptProject()`
- `createTypeScriptProject()` → used by → `createServerBase()`

## See Also

- [Package READMEs](../README.md#packages) - Detailed package documentation
- [Architecture Guide](ARCHITECTURE.md) - System architecture
- [Plugin System](PLUGINS.md) - Plugin development guide
