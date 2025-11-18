# VirtualCode Guide (LLM-Optimized)

Comprehensive guide to VirtualCode optimized for LLM consumption.

## Overview

VirtualCode is the core abstraction in Volar.js. It represents generated code (typically TypeScript) derived from source files, enabling language service features for any language.

## Key Properties

### id: string
Unique identifier within a source file. Common values: "main", "root", "script", "template", "style".

### languageId: string
Language of generated code. Typically "typescript" for type checking, but can be "javascript", "html", "css", etc.

### snapshot: IScriptSnapshot
Immutable snapshot of generated code content. Provides `getText()`, `getLength()`, and `getChangeRange()`.

### mappings: CodeMapping[]
Mappings from source code to virtual code. Each mapping includes:
- `sourceOffsets`: Positions in source
- `generatedOffsets`: Positions in generated code
- `lengths`: Lengths of mapped regions
- `data`: CodeInformation controlling features

### embeddedCodes?: VirtualCode[]
Nested virtual codes for multi-part files (e.g., Vue: script, template, style).

### associatedScriptMappings?: Map<unknown, CodeMapping[]>
Mappings to multiple source scripts for multi-file scenarios.

### linkedCodeMappings?: Mapping[]
Mappings for synchronized editing (e.g., HTML tag pairs).

## Creation Process

1. **Get source code**: `snapshot.getText(0, snapshot.getLength())`
2. **Transform**: Convert source to target language (usually TypeScript)
3. **Create snapshot**: Create IScriptSnapshot of generated code
4. **Create mappings**: Map positions between source and generated
5. **Set CodeInformation**: Configure feature flags for each region
6. **Return VirtualCode**: Return complete VirtualCode object

## Usage Patterns

### Accessing VirtualCode

```typescript
const sourceScript = language.scripts.get(uri);
const virtualCode = sourceScript?.generated?.root;
```

### Mapping Positions

```typescript
const mapper = language.maps.get(virtualCode, sourceScript);

// Source to virtual
for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
  sourceOffset,
  (data) => data.semantic === true
)) {
  // Process at virtualOffset
}

// Virtual to source
for (const [sourceOffset, mapping] of mapper.toSourceLocation(
  virtualOffset,
  (data) => data.verification === true
)) {
  // Process at sourceOffset
}
```

### Iterating Embedded Codes

```typescript
import { forEachEmbeddedCode } from '@volar/language-core';

for (const code of forEachEmbeddedCode(virtualCode)) {
  console.log(`${code.id}: ${code.languageId}`);
}
```

## Update Patterns

### Incremental Update

```typescript
updateVirtualCode(uri, virtualCode, newSnapshot, ctx) {
  const changeRange = virtualCode.snapshot.getChangeRange(newSnapshot);
  
  if (!changeRange) {
    return this.createVirtualCode(uri, 'my-lang', newSnapshot, ctx);
  }
  
  // Incrementally update
  return this.updateIncrementally(virtualCode, changeRange, newSnapshot);
}
```

### Full Recreation

```typescript
updateVirtualCode(uri, virtualCode, newSnapshot, ctx) {
  // Fall back to full recreation
  return this.createVirtualCode(uri, 'my-lang', newSnapshot, ctx);
}
```

## CodeInformation Flags

- `verification`: Diagnostics and code actions
- `completion`: Code completion
- `semantic`: Hover, semantic tokens, inlay hints
- `navigation`: Go-to-definition, references, rename
- `structure`: Document symbols, folding
- `format`: Formatting

Each flag can be:
- `true`: Enable feature
- `false`: Disable feature
- Object: Advanced configuration with callbacks

## Common Patterns

### Simple 1:1 Mapping

```typescript
{
  id: 'main',
  languageId: 'typescript',
  snapshot: createSnapshot(generatedCode),
  mappings: [{
    sourceOffsets: [0],
    generatedOffsets: [0],
    lengths: [sourceCode.length],
    data: {
      verification: true,
      navigation: true,
      completion: true,
      semantic: true,
      structure: true,
      format: true,
    },
  }],
}
```

### Multiple Regions

```typescript
mappings: [
  {
    sourceOffsets: [0, 10, 20],
    generatedOffsets: [0, 15, 30],
    lengths: [5, 5, 5],
    data: { verification: true },
  },
]
```

### Embedded Codes

```typescript
{
  id: 'root',
  languageId: 'typescript',
  snapshot: scriptSnapshot,
  mappings: scriptMappings,
  embeddedCodes: [
    {
      id: 'template',
      languageId: 'html',
      snapshot: templateSnapshot,
      mappings: templateMappings,
    },
  ],
}
```

## Lifecycle

1. **Creation**: `createVirtualCode()` called
2. **Registration**: Stored in `SourceScript.generated.root`
3. **Usage**: Language service features use virtual code
4. **Update**: `updateVirtualCode()` called on changes
5. **Disposal**: `disposeVirtualCode()` called when file closes

## Integration Flow

```
Source File
    ↓
LanguagePlugin.createVirtualCode()
    ↓
VirtualCode created
    ↓
Registered in SourceScript
    ↓
LanguageServicePlugin receives request
    ↓
Maps source position → virtual position
    ↓
Processes virtual code
    ↓
Maps result → source position
    ↓
Returns to client
```

## See Also

- [Language Plugin Complete Guide](../guides/language-plugin-complete-guide.md)
- [VirtualCode Complete Reference](../guides/virtualcode-complete-reference.md)
- [Mapping System Guide](../guides/mapping-system-guide.md)

