# Data Flow

This document explains how data flows through the Volar.js system, from source files to language service responses.

## Overview

Volar.js processes language service requests through several stages:

1. **Source File** → SourceScript
2. **SourceScript** → VirtualCode (via LanguagePlugin)
3. **VirtualCode** → Language Service Request
4. **Language Service** → Feature Provider (via LanguageServicePlugin)
5. **Feature Provider** → Response (mapped back to source)

## Source File to SourceScript Flow

```
1. File System Event / User Action
   │
   ├─> File opened/changed/deleted
   │
   ├─> Sync function called
   │   └─> language.scripts.set(uri, snapshot, languageId)
   │
   ├─> SourceScript created/updated
   │   ├─ id: URI
   │   ├─ languageId: string
   │   ├─ snapshot: IScriptSnapshot
   │   └─ generated: undefined (initially)
   │
   └─> LanguagePlugin.getLanguageId() called
       └─> Returns language ID or undefined
```

### Example

```typescript
// File: example.vue
const uri = URI.parse('file:///example.vue');
const snapshot = createSnapshot(fileContent);

// Create SourceScript
language.scripts.set(uri, snapshot, 'vue');

// SourceScript created:
{
  id: uri,
  languageId: 'vue',
  snapshot: snapshot,
  generated: undefined
}
```

## VirtualCode Generation Flow

```
1. SourceScript created/updated
   │
   ├─> LanguagePlugin.createVirtualCode() called
   │   ├─ Input: scriptId, languageId, snapshot, ctx
   │   └─ Output: VirtualCode | undefined
   │
   ├─> VirtualCode created
   │   ├─ id: string
   │   ├─ languageId: string
   │   ├─ snapshot: IScriptSnapshot (generated code)
   │   ├─ mappings: CodeMapping[]
   │   └─ embeddedCodes?: VirtualCode[]
   │
   ├─> Mappings created
   │   └─ Maps positions: source ↔ generated
   │
   └─> SourceScript.generated.root = VirtualCode
```

### Example

```typescript
// SourceScript for example.vue
const sourceScript = language.scripts.get(uri);

// LanguagePlugin creates VirtualCode
const virtualCode = vuePlugin.createVirtualCode(
  uri,
  'vue',
  sourceScript.snapshot,
  ctx
);

// VirtualCode created:
{
  id: 'script',
  languageId: 'typescript',
  snapshot: createSnapshot(generatedTypeScript),
  mappings: [
    {
      sourceOffsets: [0, 100, 200],
      generatedOffsets: [0, 150, 300],
      lengths: [100, 100, 50],
      data: {
        verification: true,
        navigation: true
      }
    }
  ],
  embeddedCodes: [
    { id: 'template', languageId: 'html', ... },
    { id: 'style', languageId: 'css', ... }
  ]
}

// Attached to SourceScript
sourceScript.generated = {
  root: virtualCode,
  languagePlugin: vuePlugin,
  embeddedCodes: new Map()
};
```

## Language Service Request Flow

### Completion Request Example

```
1. User types '.' at position (10, 5)
   │
   ├─> languageService.getCompletionItems(uri, position)
   │
   ├─> Get SourceScript
   │   └─> language.scripts.get(uri)
   │
   ├─> Get VirtualCode
   │   └─> sourceScript.generated.root
   │
   ├─> Map position to VirtualCode
   │   └─> mapper.toGeneratedLocation(sourcePosition)
   │       └─> Returns: [(virtualOffset, mapping), ...]
   │
   ├─> Get virtual document
   │   └─> context.documents.get(virtualUri, languageId, snapshot)
   │
   ├─> Iterate LanguageServicePlugins
   │   └─> For each plugin with completionProvider:
   │       ├─> Check if plugin provides completion
   │       ├─> Call plugin.provide.provideCompletionItems()
   │       └─> Map results back to source positions
   │
   └─> Return merged completion items
```

### Detailed Flow

```typescript
// 1. Request comes in
const completions = await languageService.getCompletionItems(
  uri, // Source file URI
  position // Position in source file
);

// 2. Get SourceScript
const sourceScript = language.scripts.get(uri);

// 3. Get VirtualCode
const virtualCode = sourceScript.generated.root;

// 4. Get Mapper
const mapper = language.maps.get(virtualCode, sourceScript);

// 5. Map source position to virtual position
for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
  sourceDocument.offsetAt(position)
)) {
  // Check if completion is enabled for this mapping
  if (isCompletionEnabled(mapping.data)) {
    // 6. Get virtual document
    const virtualDocument = context.documents.get(
      virtualUri,
      virtualCode.languageId,
      virtualCode.snapshot
    );

    // 7. Call plugin providers
    for (const [plugin, instance] of context.plugins) {
      if (plugin.capabilities.completionProvider) {
        const result = await instance.provide?.provideCompletionItems(
          virtualDocument,
          virtualDocument.positionAt(virtualOffset),
          context,
          token
        );

        // 8. Map results back to source
        if (result) {
          // Map completion item positions
          // Map insert text ranges
          // Return mapped results
        }
      }
    }
  }
}
```

## Mapping System Flow

### Position Mapping

```
Source Position (line 10, char 5)
   │
   ├─> Convert to offset: sourceOffset = 150
   │
   ├─> mapper.toGeneratedLocation(150)
   │   └─> Iterate mappings
   │       └─> Find mapping containing 150
   │           └─> Calculate: virtualOffset = 200
   │
   └─> Virtual Position (line 12, char 8)
```

### Range Mapping

```
Source Range (start: 100, end: 200)
   │
   ├─> mapper.toGeneratedRange(100, 200)
   │   └─> Find mappings for start and end
   │       ├─> Start mapping: source 100 → virtual 150
   │       └─> End mapping: source 200 → virtual 300
   │
   └─> Virtual Range (start: 150, end: 300)
```

### Reverse Mapping

```
Virtual Position (line 12, char 8)
   │
   ├─> Convert to offset: virtualOffset = 200
   │
   ├─> mapper.toSourceLocation(200)
   │   └─> Iterate mappings
   │       └─> Find mapping containing 200
   │           └─> Calculate: sourceOffset = 150
   │
   └─> Source Position (line 10, char 5)
```

## Plugin Execution Order

### LanguagePlugin Execution

```
1. File opened/changed
   │
   ├─> language.scripts.set(uri, snapshot, languageId)
   │
   ├─> Try plugins in order:
   │   ├─> Plugin 1.getLanguageId(uri)
   │   │   └─> Returns: 'vue' ✓
   │   │
   │   ├─> Plugin 1.createVirtualCode(...)
   │   │   └─> Returns: VirtualCode ✓
   │   │
   │   └─> Stop (first plugin that succeeds wins)
   │
   └─> SourceScript.generated.root = VirtualCode
```

### LanguageServicePlugin Execution

```
1. Feature request (e.g., getCompletionItems)
   │
   ├─> Get virtual document
   │
   ├─> Iterate plugins in order:
   │   ├─> Plugin 1: Has completionProvider? Yes
   │   │   └─> Call provideCompletionItems()
   │   │       └─> Returns: CompletionList
   │   │
   │   ├─> Plugin 2: Has completionProvider? Yes
   │   │   └─> Call provideCompletionItems()
   │   │       └─> Returns: CompletionList
   │   │
   │   └─> Merge results
   │       └─> Return combined CompletionList
   │
   └─> Map results back to source positions
```

## Caching and Performance

### Snapshot Caching

```
1. File content changes
   │
   ├─> New snapshot created
   │
   ├─> Check if snapshot changed
   │   └─> snapshot.getChangeRange(oldSnapshot)
   │
   ├─> If changed:
   │   ├─> Update SourceScript.snapshot
   │   ├─> Trigger VirtualCode update
   │   └─> Invalidate caches
   │
   └─> If unchanged:
       └─> Use cached results
```

### Mapper Caching

```
1. Request mapper for (virtualCode, sourceScript)
   │
   ├─> Check cache: WeakMap<virtualCode.snapshot, WeakMap<sourceScript.snapshot, Mapper>>
   │
   ├─> If cached:
   │   └─> Return cached mapper
   │
   └─> If not cached:
       ├─> Create mapper from mappings
       ├─> Cache mapper
       └─> Return mapper
```

### Document Caching

```
1. Request document for (uri, languageId, snapshot)
   │
   ├─> Check cache: WeakMap<snapshot, UriMap<TextDocument>>
   │
   ├─> If cached:
   │   └─> Return cached document
   │
   └─> If not cached:
       ├─> Create TextDocument
       ├─> Cache document
       └─> Return document
```

## Error Handling Flow

```
1. Error occurs in plugin
   │
   ├─> Error caught by language service
   │
   ├─> Error logged (if console available)
   │
   ├─> Plugin marked as disabled (optional)
   │
   └─> Request continues with other plugins
       └─> Or returns empty result
```

## Related Documentation

- [Architecture Guide](ARCHITECTURE.md) - System architecture
- [Plugin System](PLUGINS.md) - Plugin development
- [@volar/language-core](../packages/language-core/README.md) - Core APIs
- [@volar/language-service](../packages/language-service/README.md) - Service APIs
