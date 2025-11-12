# API Reference (LLM-Optimized)

Structured API reference optimized for LLM consumption.

## @volar/language-core

### createLanguage

```typescript
function createLanguage<T>(
  plugins: LanguagePlugin<T>[],
  scriptRegistry: Map<T, SourceScript<T>>,
  sync: (id: T, includeFsFiles: boolean, shouldRegister: boolean) => void,
  onAssociationDirty?: (targetId: T) => void
): Language<T>;
```

Creates a language instance for managing language processing.

**Parameters**:

- `plugins`: Language plugins array
- `scriptRegistry`: Map to store source scripts
- `sync`: Function to synchronize scripts
- `onAssociationDirty`: Callback when associations become dirty

**Returns**: `Language<T>` instance

---

### Language.scripts.get

```typescript
get(id: T, includeFsFiles?: boolean, shouldRegister?: boolean): SourceScript<T> | undefined
```

Retrieves a source script by ID.

---

### Language.scripts.set

```typescript
set(
  id: T,
  snapshot: IScriptSnapshot,
  languageId?: string,
  plugins?: LanguagePlugin<T>[]
): SourceScript<T> | undefined
```

Creates or updates a source script.

---

### Language.maps.get

```typescript
get(virtualCode: VirtualCode, sourceScript: SourceScript<T>): Mapper
```

Gets a mapper for translating positions between virtual code and source script.

---

## @volar/language-service

### createLanguageService

```typescript
function createLanguageService(
  language: Language<URI>,
  plugins: LanguageServicePlugin[],
  env: LanguageServiceEnvironment,
  project: ProjectContext
): LanguageService;
```

Creates a language service instance.

**Parameters**:

- `language`: Language instance
- `plugins`: Service plugins array
- `env`: Environment configuration
- `project`: Project context

**Returns**: `LanguageService` instance

---

### LanguageService.getCompletionItems

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

### LanguageService.getHover

```typescript
getHover(
  uri: URI,
  position: Position,
  token?: CancellationToken
): Promise<Hover | undefined>
```

Provides hover information at a position.

---

### LanguageService.getDiagnostics

```typescript
getDiagnostics(
  uri: URI,
  token?: CancellationToken
): Promise<Diagnostic[] | undefined>
```

Provides diagnostics for a document.

---

## @volar/language-server

### createServerBase

```typescript
function createServerBase(
  connection: Connection,
  env: LanguageServerEnvironment
): LanguageServerBase;
```

Creates a base server instance.

---

### createTypeScriptProject

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

### createSimpleProject

```typescript
function createSimpleProject(
  languagePlugins: LanguagePlugin<URI>[]
): LanguageServerProject;
```

Creates a simple project without TypeScript.

---

## Usage Patterns

### Pattern: Create Language and Service

```typescript
const language = createLanguage(plugins, registry, sync);
const service = createLanguageService(language, servicePlugins, env, {});
```

### Pattern: Get Completions

```typescript
const completions = await service.getCompletionItems(uri, position);
```

### Pattern: Map Position

```typescript
const mapper = language.maps.get(virtualCode, sourceScript);
for (const [mapped] of mapper.toGeneratedLocation(sourceOffset)) {
  // Use mapped position
}
```

## Common Pitfalls

1. **Forgetting to sync**: Always call sync function before accessing scripts
2. **Wrong position mapping**: Use mapper methods, don't assume 1:1 mapping
3. **Missing CodeInformation**: Set appropriate flags in mappings
4. **Not handling cancellation**: Always respect cancellation tokens
5. **Cache invalidation**: Mappings are cached by snapshot, ensure snapshots update

## Error Conditions

- `get()` returns `undefined` if script not found
- Feature methods return `undefined` if no providers available
- Mapper methods return empty generator if no mappings found
- Plugin methods can throw errors - always handle exceptions
