# SourceScript and Language System Guide

A comprehensive guide to understanding `SourceScript`, the `Language` instance, and the script registry system in Volar.js.

## Table of Contents

- [Introduction](#introduction)
- [SourceScript Structure](#sourcescript-structure)
- [Language Instance](#language-instance)
- [Script Registry](#script-registry)
- [Script Lifecycle](#script-lifecycle)
- [Association System](#association-system)
- [How Scripts Are Synchronized](#how-scripts-are-synchronized)
- [Common Patterns](#common-patterns)

## Introduction

The `Language` instance manages all source files and their virtual code through a script registry. Each source file is represented as a `SourceScript` that contains the original file content and its generated virtual code.

### Key Concepts

- **SourceScript**: Represents an original source file with its virtual code
- **Language**: Main instance managing the script registry and mappings
- **Script Registry**: Map storing all source scripts
- **Association System**: Tracks relationships between files

## SourceScript Structure

### Interface

```typescript
interface SourceScript<T = unknown> {
  /** Unique identifier for this source script (typically a URI) */
  id: T;

  /** Language ID of the source file (e.g., "typescript", "vue") */
  languageId: string;

  /** Immutable snapshot of the file content */
  snapshot: IScriptSnapshot;

  /** Set of script IDs that depend on this script */
  targetIds: Set<T>;

  /** Set of script IDs that this script depends on */
  associatedIds: Set<T>;

  /** Whether this file is only used as a source for generated files */
  associatedOnly: boolean;

  /** Whether associations need to be recalculated */
  isAssociationDirty?: boolean;

  /** Generated virtual code from this source script */
  generated?: {
    /** Root virtual code */
    root: VirtualCode;

    /** Language plugin that generated this virtual code */
    languagePlugin: LanguagePlugin<T>;

    /** Map of embedded code IDs to virtual codes */
    embeddedCodes: Map<string, VirtualCode>;
  };
}
```

### Properties Explained

**id**: Unique identifier (typically `URI`)

**languageId**: Language of the source file (from `getLanguageId`)

**snapshot**: Immutable file content snapshot

**targetIds**: Scripts that depend on this one (e.g., files that import this file)

**associatedIds**: Scripts this file depends on (e.g., files this file imports)

**associatedOnly**: If `true`, file is only used as source for generated files (not processed directly)

**isAssociationDirty**: Flag indicating associations need recalculation

**generated**: Contains the virtual code generated from this source:
- `root`: Main virtual code
- `languagePlugin`: Plugin that created it
- `embeddedCodes`: Map of embedded virtual codes

## Language Instance

### Creating a Language Instance

```typescript
import { createLanguage } from '@volar/language-core';
import { URI } from 'vscode-uri';

const scriptRegistry = new Map<URI, SourceScript<URI>>();

const language = createLanguage(
  [myLanguagePlugin, anotherPlugin],
  scriptRegistry,
  syncFunction,
  onAssociationDirty
);
```

### Language Interface

```typescript
interface Language<T = unknown> {
  /** Factory for creating mappers from mappings */
  mapperFactory: MapperFactory;

  /** Array of language plugins */
  plugins: LanguagePlugin<T>[];

  /** Script registry operations */
  scripts: {
    get(id: T, includeFsFiles?: boolean, shouldRegister?: boolean): SourceScript<T> | undefined;
    set(id: T, snapshot: IScriptSnapshot, languageId?: string, plugins?: LanguagePlugin<T>[]): SourceScript<T> | undefined;
    delete(id: T): void;
    fromVirtualCode(virtualCode: VirtualCode): SourceScript<T>;
  };

  /** Mapping operations */
  maps: {
    get(virtualCode: VirtualCode, sourceScript: SourceScript<T>): Mapper;
    forEach(virtualCode: VirtualCode): Generator<[SourceScript<T>, Mapper]>;
  };

  /** Linked code map operations */
  linkedCodeMaps: {
    get(virtualCode: VirtualCode): LinkedCodeMap | undefined;
  };
}
```

## Script Registry

### Registry Structure

The script registry is a `Map<T, SourceScript<T>>` that stores all source scripts:

```typescript
const scriptRegistry = new Map<URI, SourceScript<URI>>();

// Scripts are stored by their ID (URI)
scriptRegistry.set(uri, sourceScript);

// Retrieve script
const script = scriptRegistry.get(uri);
```

### Registry Lifecycle

1. **Creation**: Registry is created before `createLanguage`
2. **Population**: Scripts are added via `language.scripts.set()`
3. **Access**: Scripts are accessed via `language.scripts.get()`
4. **Cleanup**: Scripts are removed via `language.scripts.delete()`

## Script Lifecycle

### Getting a Script

```typescript
const sourceScript = language.scripts.get(uri);
```

**Parameters**:
- `id`: Script identifier
- `includeFsFiles`: Include file system files (default: `true`)
- `shouldRegister`: Register script if not found (default: `false`)

**Returns**: `SourceScript` or `undefined`

**Behavior**:
- Calls `sync` function if script not found
- Returns script if exists
- Returns `undefined` if not found and not registered

**Example**:

```typescript
// Get script (will sync if needed)
const script = language.scripts.get(uri);

// Get script without syncing file system files
const script = language.scripts.get(uri, false);

// Get script and register if not found
const script = language.scripts.get(uri, true, true);
```

### Setting a Script

```typescript
const sourceScript = language.scripts.set(uri, snapshot, languageId);
```

**Parameters**:
- `id`: Script identifier
- `snapshot`: File content snapshot
- `languageId`: Language ID (optional, auto-detected if not provided)
- `plugins`: Plugins to use (optional, uses language plugins if not provided)

**Returns**: `SourceScript` or `undefined`

**Behavior**:
- Creates new script if doesn't exist
- Updates existing script if already exists
- Generates virtual code via plugins
- Updates associations

**Example**:

```typescript
// Set script with auto-detected language
const script = language.scripts.set(uri, snapshot);

// Set script with explicit language
const script = language.scripts.set(uri, snapshot, 'typescript');

// Set script with specific plugins
const script = language.scripts.set(uri, snapshot, 'vue', [vuePlugin]);
```

### Deleting a Script

```typescript
language.scripts.delete(uri);
```

**Parameters**:
- `id`: Script identifier

**Behavior**:
- Removes script from registry
- Calls `disposeVirtualCode` on plugin
- Updates associations
- Triggers dirty flags on dependent scripts

**Example**:

```typescript
// Delete script
language.scripts.delete(uri);
```

### Getting SourceScript from VirtualCode

```typescript
const sourceScript = language.scripts.fromVirtualCode(virtualCode);
```

**Parameters**:
- `virtualCode`: Virtual code instance

**Returns**: `SourceScript` that generated the virtual code

**Example**:

```typescript
const virtualCode = sourceScript.generated.root;
const sourceScript2 = language.scripts.fromVirtualCode(virtualCode);
// sourceScript === sourceScript2
```

## Association System

### Understanding Associations

Associations track relationships between files:
- **associatedIds**: Files this file depends on (imports, references)
- **targetIds**: Files that depend on this file (importers, references)

### Association Flow

```
File A imports File B
    ↓
File A.associatedIds.add(File B.id)
File B.targetIds.add(File A.id)
    ↓
When File B changes:
    ↓
File A.isAssociationDirty = true
    ↓
File A virtual code regenerated
```

### Using Associations

Associations are accessed via `CodegenContext`:

```typescript
createVirtualCode(uri, languageId, snapshot, ctx) {
  // Get associated file
  const configFile = ctx.getAssociatedScript(configUri);
  
  if (configFile) {
    // Use config file in code generation
    const config = configFile.snapshot.getText(0, configFile.snapshot.getLength());
    // ...
  }
}
```

### Association Dirty Flag

When an associated file changes:
1. `isAssociationDirty` is set to `true` on dependent files
2. Dependent files are regenerated when accessed
3. Associations are recalculated

**Example**:

```typescript
// File A depends on File B
// When File B changes:
fileA.isAssociationDirty = true;

// When File A is accessed:
if (fileA.isAssociationDirty) {
  // Regenerate virtual code
  language.scripts.set(fileA.id, fileA.snapshot, fileA.languageId);
}
```

## How Scripts Are Synchronized

### Sync Function

The sync function is called to load files:

```typescript
const sync = (id: URI, includeFsFiles: boolean, shouldRegister: boolean) => {
  // Load file from file system
  if (includeFsFiles) {
    const content = fs.readFileSync(id.fsPath, 'utf-8');
    const snapshot = createSnapshot(content);
    language.scripts.set(id, snapshot);
  }
  
  // Register file if needed
  if (shouldRegister) {
    // Register file in system
  }
};
```

### Sync Function Parameters

- `id`: File identifier to sync
- `includeFsFiles`: Whether to include file system files
- `shouldRegister`: Whether to register file if not found

### When Sync is Called

1. **Script Access**: When `language.scripts.get()` is called and script not found
2. **Association Access**: When `ctx.getAssociatedScript()` is called
3. **File System Changes**: When files are added/changed (via file watchers)

### Sync Function Best Practices

```typescript
const sync = (id: URI, includeFsFiles: boolean, shouldRegister: boolean) => {
  // Check cache first
  if (scriptRegistry.has(id)) {
    return; // Already synced
  }

  // Load from file system
  if (includeFsFiles && fs.existsSync(id.fsPath)) {
    try {
      const content = fs.readFileSync(id.fsPath, 'utf-8');
      const snapshot = createSnapshot(content);
      language.scripts.set(id, snapshot);
    } catch (error) {
      console.error(`Failed to load ${id}:`, error);
    }
  }

  // Register if needed
  if (shouldRegister) {
    // Register file
  }
};
```

## Common Patterns

### Pattern 1: Basic Script Management

```typescript
// Create language
const scriptRegistry = new Map<URI, SourceScript<URI>>();
const language = createLanguage(
  [myPlugin],
  scriptRegistry,
  (uri, includeFsFiles, shouldRegister) => {
    if (includeFsFiles && fs.existsSync(uri.fsPath)) {
      const content = fs.readFileSync(uri.fsPath, 'utf-8');
      const snapshot = createSnapshot(content);
      language.scripts.set(uri, snapshot);
    }
  }
);

// Open file
const uri = URI.file('/path/to/file.ts');
const script = language.scripts.get(uri);

// Access virtual code
if (script?.generated) {
  const virtualCode = script.generated.root;
}

// Close file
language.scripts.delete(uri);
```

### Pattern 2: File Watcher Integration

```typescript
import { watch } from 'chokidar';

const language = createLanguage(plugins, registry, sync);

// Watch files
const watcher = watch('**/*.ts', { ignoreInitial: true });

watcher.on('add', (filePath) => {
  const uri = URI.file(filePath);
  language.scripts.get(uri, true, true);
});

watcher.on('change', (filePath) => {
  const uri = URI.file(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const snapshot = createSnapshot(content);
  language.scripts.set(uri, snapshot);
});

watcher.on('unlink', (filePath) => {
  const uri = URI.file(filePath);
  language.scripts.delete(uri);
});
```

### Pattern 3: Association Management

```typescript
createVirtualCode(uri, languageId, snapshot, ctx) {
  // Get associated files
  const configUri = URI.file('tsconfig.json');
  const configFile = ctx.getAssociatedScript(configUri);

  // Use in code generation
  let generatedCode = transformCode(snapshot);
  
  if (configFile) {
    const config = parseConfig(configFile.snapshot);
    generatedCode = applyConfig(generatedCode, config);
  }

  return {
    id: 'main',
    languageId: 'typescript',
    snapshot: createSnapshot(generatedCode),
    mappings: createMappings(snapshot, generatedCode),
  };
}
```

### Pattern 4: Multi-File Language Plugin

```typescript
const multiFilePlugin: LanguagePlugin<URI> = {
  createVirtualCode(uri, languageId, snapshot, ctx) {
    // Get associated files
    const scriptFile = ctx.getAssociatedScript(URI.file(uri.fsPath + '.script'));
    const styleFile = ctx.getAssociatedScript(URI.file(uri.fsPath + '.style'));

    // Combine files
    const mainContent = snapshot.getText(0, snapshot.getLength());
    let generatedCode = transformMain(mainContent);

    if (scriptFile) {
      const scriptContent = scriptFile.snapshot.getText(0, scriptFile.snapshot.getLength());
      generatedCode += transformScript(scriptContent);
    }

    if (styleFile) {
      const styleContent = styleFile.snapshot.getText(0, styleFile.snapshot.getLength());
      generatedCode += transformStyle(styleContent);
    }

    return {
      id: 'main',
      languageId: 'typescript',
      snapshot: createSnapshot(generatedCode),
      mappings: createMappings(mainContent, generatedCode),
    };
  },
};
```

### Pattern 5: Script Registry Inspection

```typescript
// Iterate over all scripts
for (const [uri, script] of scriptRegistry) {
  console.log(`File: ${uri.fsPath}`);
  console.log(`Language: ${script.languageId}`);
  console.log(`Has virtual code: ${!!script.generated}`);
  
  if (script.generated) {
    console.log(`Virtual code ID: ${script.generated.root.id}`);
    console.log(`Embedded codes: ${script.generated.embeddedCodes.size}`);
  }
  
  console.log(`Dependencies: ${script.associatedIds.size}`);
  console.log(`Dependents: ${script.targetIds.size}`);
}
```

## Related Documentation

- [Language Plugin Complete Guide](./language-plugin-complete-guide.md) - Creating plugins
- [VirtualCode Complete Reference](./virtualcode-complete-reference.md) - Understanding virtual code
- [Mapping System Guide](./mapping-system-guide.md) - Working with mappings
- [Script Snapshot Guide](./script-snapshot-guide.md) - Understanding snapshots
- [Advanced Patterns](./advanced-patterns.md) - Advanced patterns
- [Integration Guide](./integration-guide.md) - System integration

