# Integration Guide: How It All Fits Together

A comprehensive guide showing how LanguagePlugin, VirtualCode, and LanguageServicePlugin work together in Volar.js.

## Table of Contents

- [Introduction](#introduction)
- [System Architecture Overview](#system-architecture-overview)
- [LanguagePlugin → VirtualCode → LanguageServicePlugin Flow](#languageplugin--virtualcode--languageserviceplugin-flow)
- [How LanguageServicePlugin Uses VirtualCode](#how-languageserviceplugin-uses-virtualcode)
- [Position Mapping in Language Features](#position-mapping-in-language-features)
- [CodeInformation Filtering in Features](#codeinformation-filtering-in-features)
- [End-to-End Examples](#end-to-end-examples)

## Introduction

This guide explains how the different components of Volar.js work together to provide language service features. Understanding this integration is crucial for building effective language plugins.

### Component Overview

- **LanguagePlugin**: Transforms source files into virtual code
- **VirtualCode**: Generated code with mappings to source
- **LanguageServicePlugin**: Provides language features (completion, hover, etc.)
- **Language**: Manages scripts and mappings
- **LanguageService**: Orchestrates language features

## System Architecture Overview

### High-Level Flow

```
Source File (.vue, .svelte, etc.)
    ↓
LanguagePlugin.createVirtualCode()
    ↓
VirtualCode (TypeScript with mappings)
    ↓
Registered in Language.scripts
    ↓
LanguageServicePlugin receives feature request
    ↓
Maps source position → virtual position
    ↓
Processes virtual code
    ↓
Maps result → source position
    ↓
Returns to client (IDE)
```

### Component Relationships

```
┌─────────────────┐
│ LanguagePlugin  │───creates───┐
└─────────────────┘              │
                                 ▼
┌─────────────────┐         ┌──────────────┐
│  SourceScript   │──has───▶│ VirtualCode  │
└─────────────────┘         └──────────────┘
      │                            │
      │                            │
      │                            │
      ▼                            ▼
┌─────────────────┐         ┌──────────────┐
│    Language     │──uses───▶│    Mapper    │
└─────────────────┘         └──────────────┘
      │                            │
      │                            │
      ▼                            ▼
┌─────────────────┐         ┌──────────────┐
│ LanguageService │──uses───▶│LanguageService│
│                 │         │    Plugin     │
└─────────────────┘         └──────────────┘
```

## LanguagePlugin → VirtualCode → LanguageServicePlugin Flow

### Step 1: File Opens

```typescript
// User opens file.vue
const uri = URI.file('/path/to/file.vue');

// Language system requests script
const sourceScript = language.scripts.get(uri);
```

### Step 2: LanguagePlugin Creates VirtualCode

```typescript
// LanguagePlugin.createVirtualCode() is called
const virtualCode = vuePlugin.createVirtualCode(
  uri,
  'vue',
  snapshot,
  ctx
);

// Returns VirtualCode
return {
  id: 'root',
  languageId: 'typescript',
  snapshot: scriptSnapshot,
  mappings: [/* mappings */],
  embeddedCodes: [/* template, style */],
};
```

### Step 3: VirtualCode Registered

```typescript
// VirtualCode is registered in SourceScript
sourceScript.generated = {
  root: virtualCode,
  languagePlugin: vuePlugin,
  embeddedCodes: new Map([
    ['template', templateCode],
    ['style', styleCode],
  ]),
};
```

### Step 4: LanguageServicePlugin Receives Request

```typescript
// User requests hover at position (line 10, col 5)
const hover = await languageService.getHover(uri, { line: 10, character: 5 });
```

### Step 5: Position Mapping

```typescript
// LanguageServicePlugin maps source position to virtual position
const sourceScript = language.scripts.get(uri);
const virtualCode = sourceScript.generated.root;
const mapper = language.maps.get(virtualCode, sourceScript);

// Map source offset to virtual offset
const sourceOffset = document.offsetAt({ line: 10, character: 5 });
for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
  sourceOffset,
  (data) => data.semantic === true // Filter by CodeInformation
)) {
  // Process at virtualOffset
}
```

### Step 6: Process Virtual Code

```typescript
// LanguageServicePlugin processes virtual code
const virtualDocument = getVirtualDocument(virtualCode, virtualOffset);
const hoverInfo = getHoverInfo(virtualDocument, virtualOffset);
```

### Step 7: Map Result Back

```typescript
// Map result range back to source
const resultRange = hoverInfo.range;
for (const [sourceStart, sourceEnd] of mapper.toSourceRange(
  resultRange.start,
  resultRange.end,
  false,
  (data) => data.semantic === true
)) {
  // Return hover with source range
  return {
    contents: hoverInfo.contents,
    range: {
      start: document.positionAt(sourceStart),
      end: document.positionAt(sourceEnd),
    },
  };
}
```

## How LanguageServicePlugin Uses VirtualCode

### Accessing VirtualCode

```typescript
const plugin: LanguageServicePlugin = {
  create(context) {
    return {
      provide: {
        provideHover(document, position, token) {
          // Get source script
          const sourceScript = context.language.scripts.get(document.uri);
          if (!sourceScript?.generated) {
            return undefined;
          }

          // Get virtual code
          const virtualCode = sourceScript.generated.root;

          // Get mapper
          const mapper = context.language.maps.get(virtualCode, sourceScript);

          // Map position
          const sourceOffset = document.offsetAt(position);
          for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
            sourceOffset,
            (data) => data.semantic === true
          )) {
            // Process virtual code at virtualOffset
            return processHover(virtualCode, virtualOffset);
          }
        },
      },
    };
  },
};
```

### Processing Embedded Codes

```typescript
provideHover(document, position, token) {
  const sourceScript = context.language.scripts.get(document.uri);
  if (!sourceScript?.generated) {
    return undefined;
  }

  // Check all embedded codes
  import { forEachEmbeddedCode } from '@volar/language-core';
  for (const embeddedCode of forEachEmbeddedCode(sourceScript.generated.root)) {
    const mapper = context.language.maps.get(embeddedCode, sourceScript);
    
    const sourceOffset = document.offsetAt(position);
    for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
      sourceOffset,
      (data) => data.semantic === true
    )) {
      // Check if position is in this embedded code
      if (isInRange(virtualOffset, embeddedCode)) {
        return processHover(embeddedCode, virtualOffset);
      }
    }
  }
}
```

### Using CodeInformation Filters

```typescript
provideDiagnostics(document, token) {
  const sourceScript = context.language.scripts.get(document.uri);
  if (!sourceScript?.generated) {
    return [];
  }

  const virtualCode = sourceScript.generated.root;
  const mapper = context.language.maps.get(virtualCode, sourceScript);

  // Get diagnostics from virtual code
  const virtualDiagnostics = getDiagnosticsFromVirtualCode(virtualCode);

  // Map diagnostics back to source
  const sourceDiagnostics = [];
  for (const diagnostic of virtualDiagnostics) {
    // Only map if verification is enabled
    for (const [sourceStart, sourceEnd] of mapper.toSourceRange(
      diagnostic.range.start,
      diagnostic.range.end,
      false,
      (data) => data.verification === true
    )) {
      sourceDiagnostics.push({
        ...diagnostic,
        range: {
          start: document.positionAt(sourceStart),
          end: document.positionAt(sourceEnd),
        },
      });
    }
  }

  return sourceDiagnostics;
}
```

## Position Mapping in Language Features

### Mapping Source to Virtual

```typescript
function mapSourceToVirtual(
  language: Language<URI>,
  uri: URI,
  sourcePosition: Position
): { virtualCode: VirtualCode; virtualOffset: number } | undefined {
  const sourceScript = language.scripts.get(uri);
  if (!sourceScript?.generated) {
    return undefined;
  }

  const virtualCode = sourceScript.generated.root;
  const mapper = language.maps.get(virtualCode, sourceScript);

  const sourceOffset = document.offsetAt(sourcePosition);
  for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(sourceOffset)) {
    return { virtualCode, virtualOffset };
  }

  return undefined;
}
```

### Mapping Virtual to Source

```typescript
function mapVirtualToSource(
  language: Language<URI>,
  virtualCode: VirtualCode,
  virtualOffset: number
): { uri: URI; sourceOffset: number } | undefined {
  const sourceScript = language.scripts.fromVirtualCode(virtualCode);
  const mapper = language.maps.get(virtualCode, sourceScript);

  for (const [sourceOffset, mapping] of mapper.toSourceLocation(virtualOffset)) {
    return { uri: sourceScript.id, sourceOffset };
  }

  return undefined;
}
```

### Mapping Ranges

```typescript
function mapRangeToVirtual(
  language: Language<URI>,
  uri: URI,
  sourceRange: Range
): { virtualCode: VirtualCode; virtualRange: Range } | undefined {
  const sourceScript = language.scripts.get(uri);
  if (!sourceScript?.generated) {
    return undefined;
  }

  const virtualCode = sourceScript.generated.root;
  const mapper = language.maps.get(virtualCode, sourceScript);

  const sourceStart = document.offsetAt(sourceRange.start);
  const sourceEnd = document.offsetAt(sourceRange.end);

  for (const [virtualStart, virtualEnd] of mapper.toGeneratedRange(
    sourceStart,
    sourceEnd,
    false
  )) {
    return {
      virtualCode,
      virtualRange: {
        start: virtualDocument.positionAt(virtualStart),
        end: virtualDocument.positionAt(virtualEnd),
      },
    };
  }

  return undefined;
}
```

## CodeInformation Filtering in Features

### Filtering by Feature Type

```typescript
// Hover: Filter by semantic
for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
  sourceOffset,
  (data) => data.semantic === true
)) {
  // Process hover
}

// Completion: Filter by completion
for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
  sourceOffset,
  (data) => data.completion === true
)) {
  // Process completion
}

// Diagnostics: Filter by verification
for (const [sourceStart, sourceEnd] of mapper.toSourceRange(
  virtualStart,
  virtualEnd,
  false,
  (data) => data.verification === true
)) {
  // Map diagnostics
}

// Navigation: Filter by navigation
for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
  sourceOffset,
  (data) => data.navigation === true
)) {
  // Process navigation
}
```

### Using Feature Worker Pattern

The language service uses a "feature worker" pattern that automatically handles mapping and filtering:

```typescript
// Feature worker automatically:
// 1. Maps source position to virtual position
// 2. Filters by CodeInformation
// 3. Processes virtual code
// 4. Maps result back to source

const hover = await languageService.getHover(uri, position);
// Position mapping and filtering handled automatically
```

## End-to-End Examples

### Example 1: Hover Feature

```typescript
// 1. User hovers over symbol in file.vue
const hover = await languageService.getHover(
  URI.file('file.vue'),
  { line: 10, character: 5 }
);

// 2. LanguageServicePlugin receives request
provideHover(document, position, token) {
  // 3. Get source script
  const sourceScript = context.language.scripts.get(document.uri);
  const virtualCode = sourceScript.generated.root;
  const mapper = context.language.maps.get(virtualCode, sourceScript);

  // 4. Map source position to virtual position
  const sourceOffset = document.offsetAt(position);
  for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
    sourceOffset,
    (data) => data.semantic === true // Filter by CodeInformation
  )) {
    // 5. Get hover info from virtual code
    const virtualDocument = getVirtualDocument(virtualCode);
    const hoverInfo = getHoverFromTypeScript(virtualDocument, virtualOffset);

    // 6. Map result range back to source
    if (hoverInfo.range) {
      for (const [sourceStart, sourceEnd] of mapper.toSourceRange(
        hoverInfo.range.start,
        hoverInfo.range.end,
        false,
        (data) => data.semantic === true
      )) {
        return {
          contents: hoverInfo.contents,
          range: {
            start: document.positionAt(sourceStart),
            end: document.positionAt(sourceEnd),
          },
        };
      }
    }

    return { contents: hoverInfo.contents };
  }
}
```

### Example 2: Completion Feature

```typescript
provideCompletionItems(document, position, context, token) {
  const sourceScript = context.language.scripts.get(document.uri);
  const virtualCode = sourceScript.generated.root;
  const mapper = context.language.maps.get(virtualCode, sourceScript);

  const sourceOffset = document.offsetAt(position);
  const completions = [];

  // Map to virtual position and filter by completion
  for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
    sourceOffset,
    (data) => data.completion === true
  )) {
    // Get completions from virtual code
    const virtualDocument = getVirtualDocument(virtualCode);
    const virtualCompletions = getCompletionsFromTypeScript(
      virtualDocument,
      virtualOffset
    );

    // Map completion ranges back to source
    for (const item of virtualCompletions.items) {
      if (item.textEdit) {
        for (const [sourceStart, sourceEnd] of mapper.toSourceRange(
          item.textEdit.range.start,
          item.textEdit.range.end,
          false,
          (data) => data.completion === true
        )) {
          completions.push({
            ...item,
            textEdit: {
              ...item.textEdit,
              range: {
                start: document.positionAt(sourceStart),
                end: document.positionAt(sourceEnd),
              },
            },
          });
        }
      } else {
        completions.push(item);
      }
    }
  }

  return { items: completions, isIncomplete: false };
}
```

### Example 3: Diagnostics Feature

```typescript
provideDiagnostics(document, token) {
  const sourceScript = context.language.scripts.get(document.uri);
  if (!sourceScript?.generated) {
    return [];
  }

  const virtualCode = sourceScript.generated.root;
  const mapper = context.language.maps.get(virtualCode, sourceScript);

  // Get diagnostics from virtual code (TypeScript)
  const virtualDocument = getVirtualDocument(virtualCode);
  const virtualDiagnostics = getDiagnosticsFromTypeScript(virtualDocument);

  // Map diagnostics back to source
  const sourceDiagnostics = [];
  for (const diagnostic of virtualDiagnostics) {
    // Filter by verification and map range
    for (const [sourceStart, sourceEnd] of mapper.toSourceRange(
      diagnostic.range.start,
      diagnostic.range.end,
      false,
      (data) => {
        // Check if diagnostic should be reported
        if (typeof data.verification === 'object') {
          return data.verification.shouldReport?.(
            diagnostic.source,
            diagnostic.code
          ) ?? true;
        }
        return data.verification === true;
      }
    )) {
      sourceDiagnostics.push({
        ...diagnostic,
        range: {
          start: document.positionAt(sourceStart),
          end: document.positionAt(sourceEnd),
        },
      });
    }
  }

  return sourceDiagnostics;
}
```

### Example 4: Go to Definition

```typescript
provideDefinition(document, position, token) {
  const sourceScript = context.language.scripts.get(document.uri);
  const virtualCode = sourceScript.generated.root;
  const mapper = context.language.maps.get(virtualCode, sourceScript);

  const sourceOffset = document.offsetAt(position);
  const definitions = [];

  // Map to virtual position and filter by navigation
  for (const [virtualOffset, mapping] of mapper.toGeneratedLocation(
    sourceOffset,
    (data) => data.navigation === true
  )) {
    // Get definition from virtual code
    const virtualDocument = getVirtualDocument(virtualCode);
    const virtualDefinitions = getDefinitionsFromTypeScript(
      virtualDocument,
      virtualOffset
    );

    // Map definition locations back to source
    for (const def of virtualDefinitions) {
      const targetScript = context.language.scripts.get(def.targetUri);
      if (!targetScript?.generated) {
        definitions.push(def);
        continue;
      }

      const targetVirtualCode = targetScript.generated.root;
      const targetMapper = context.language.maps.get(
        targetVirtualCode,
        targetScript
      );

      const virtualRange = def.targetSelectionRange || def.targetRange;
      for (const [sourceStart, sourceEnd] of targetMapper.toSourceRange(
        virtualRange.start,
        virtualRange.end,
        false,
        (data) => data.navigation === true
      )) {
        definitions.push({
          ...def,
          targetRange: {
            start: targetDocument.positionAt(sourceStart),
            end: targetDocument.positionAt(sourceEnd),
          },
          targetSelectionRange: {
            start: targetDocument.positionAt(sourceStart),
            end: targetDocument.positionAt(sourceEnd),
          },
        });
      }
    }
  }

  return definitions;
}
```

## Related Documentation

- [Language Plugin Complete Guide](./language-plugin-complete-guide.md) - Creating LanguagePlugins
- [VirtualCode Complete Reference](./virtualcode-complete-reference.md) - Understanding VirtualCode
- [Mapping System Guide](./mapping-system-guide.md) - Working with mappings
- [SourceScript and Language System](./source-script-language-system.md) - Script registry
- [Advanced Patterns](./advanced-patterns.md) - Advanced patterns

