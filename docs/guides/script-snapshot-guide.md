# Script Snapshot Guide

A comprehensive guide to understanding and working with `IScriptSnapshot` in Volar.js.

## Table of Contents

- [Introduction](#introduction)
- [IScriptSnapshot Interface](#iscriptsnapshot-interface)
- [Methods Deep Dive](#methods-deep-dive)
- [Creating Snapshots](#creating-snapshots)
- [Incremental Updates](#incremental-updates)
- [Performance Considerations](#performance-considerations)
- [Common Patterns](#common-patterns)

## Introduction

`IScriptSnapshot` is an immutable representation of file content. It provides efficient access to text content and enables incremental updates for better performance.

### What is IScriptSnapshot?

`IScriptSnapshot` is:
- **Immutable**: Content cannot be changed after creation
- **Efficient**: Provides fast text access without storing full strings
- **Incremental**: Supports change tracking for updates
- **Resource-aware**: Can hold resources that need cleanup

### Why IScriptSnapshot?

Snapshots enable:
- **Efficient updates**: Only re-parse changed sections
- **Memory efficiency**: Don't store full strings if not needed
- **Change tracking**: Determine what changed between versions
- **Resource management**: Clean up resources when done

## IScriptSnapshot Interface

The complete `IScriptSnapshot` interface:

```typescript
interface IScriptSnapshot {
  /** Gets a portion of the script snapshot specified by [start, end) */
  getText(start: number, end: number): string;

  /** Gets the length of this script snapshot */
  getLength(): number;

  /**
   * Gets the TextChangeRange that describes how the text changed.
   * Used for incremental parsing.
   */
  getChangeRange(oldSnapshot: IScriptSnapshot): TextChangeRange | undefined;

  /** Releases all resources held by this script snapshot */
  dispose?(): void;
}
```

### Related Types

```typescript
interface TextChangeRange {
  /** The span of text that changed */
  span: TextSpan;
  /** The new length of the changed text */
  newLength: number;
}

interface TextSpan {
  /** Start offset of the span */
  start: number;
  /** Length of the span */
  length: number;
}
```

## Methods Deep Dive

### getText(start: number, end: number): string

Gets a substring of the snapshot content.

**Parameters**:
- `start`: Start offset (inclusive)
- `end`: End offset (exclusive)

**Returns**: Substring from `[start, end)`

**Important**: Uses **half-open interval** `[start, end)` - `end` is exclusive.

**Example**:

```typescript
const snapshot: IScriptSnapshot = {
  getText: (start, end) => content.substring(start, end),
  // ...
};

// Get full content
const full = snapshot.getText(0, snapshot.getLength());

// Get first 10 characters
const first10 = snapshot.getText(0, 10);

// Get characters 5-15
const middle = snapshot.getText(5, 15);
```

**Edge Cases**:
- `start === end`: Returns empty string
- `start > end`: Behavior is undefined (shouldn't happen)
- `end > length`: Should clamp to `length`

### getLength(): number

Gets the total length of the snapshot content.

**Returns**: Length in characters

**Example**:

```typescript
const snapshot: IScriptSnapshot = {
  getLength: () => content.length,
  // ...
};

const length = snapshot.getLength();
```

**Performance**: Should be O(1) - cache the length if needed.

### getChangeRange(oldSnapshot: IScriptSnapshot): TextChangeRange | undefined

Gets the change range between this snapshot and an old snapshot.

**Parameters**:
- `oldSnapshot`: Previous snapshot to compare against

**Returns**: `TextChangeRange` if change can be determined, `undefined` otherwise

**Example**:

```typescript
const oldSnapshot: IScriptSnapshot = { /* ... */ };
const newSnapshot: IScriptSnapshot = { /* ... */ };

const changeRange = newSnapshot.getChangeRange(oldSnapshot);

if (changeRange) {
  console.log(`Changed at ${changeRange.span.start}, length ${changeRange.span.length}`);
  console.log(`New length: ${changeRange.newLength}`);
} else {
  // Full recreation needed
  console.log('Change range not available');
}
```

**When to Return undefined**:
- Change range cannot be determined
- Change is too large (full recreation is better)
- Snapshots are from different sources

**Performance**: Used for incremental parsing - should be fast.

### dispose?(): void

Releases resources held by the snapshot.

**Optional**: Only implement if snapshot holds resources.

**Example**:

```typescript
const snapshot: IScriptSnapshot = {
  getText: (start, end) => content.substring(start, end),
  getLength: () => content.length,
  getChangeRange: () => undefined,
  dispose: () => {
    // Clean up resources
    parserCache.delete(fileId);
    eventListeners.forEach(listener => removeEventListener(listener));
  },
};
```

**When to Implement**:
- Snapshot holds parser instances
- Snapshot has event listeners
- Snapshot caches expensive computations
- Snapshot holds file handles or streams

## Creating Snapshots

### Simple String Snapshot

```typescript
function createStringSnapshot(content: string): IScriptSnapshot {
  return {
    getText: (start, end) => content.substring(start, end),
    getLength: () => content.length,
    getChangeRange: () => undefined, // No incremental support
  };
}
```

### Snapshot with Change Tracking

```typescript
class TrackedSnapshot implements IScriptSnapshot {
  private content: string;
  private version: number;

  constructor(content: string, version: number) {
    this.content = content;
    this.version = version;
  }

  getText(start: number, end: number): string {
    return this.content.substring(start, end);
  }

  getLength(): number {
    return this.content.length;
  }

  getChangeRange(oldSnapshot: IScriptSnapshot): TextChangeRange | undefined {
    if (!(oldSnapshot instanceof TrackedSnapshot)) {
      return undefined;
    }

    // Simple diff algorithm
    const oldContent = oldSnapshot.content;
    const newContent = this.content;

    if (oldContent === newContent) {
      return undefined; // No change
    }

    // Find first difference
    let start = 0;
    while (start < oldContent.length && start < newContent.length && 
           oldContent[start] === newContent[start]) {
      start++;
    }

    // Find last difference
    let oldEnd = oldContent.length;
    let newEnd = newContent.length;
    while (oldEnd > start && newEnd > start &&
           oldContent[oldEnd - 1] === newContent[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    return {
      span: {
        start,
        length: oldEnd - start,
      },
      newLength: newEnd - start,
    };
  }
}
```

### Snapshot with Resource Cleanup

```typescript
class ResourceSnapshot implements IScriptSnapshot {
  private content: string;
  private parser: Parser;
  private cache: Map<string, any>;

  constructor(content: string, parser: Parser) {
    this.content = content;
    this.parser = parser;
    this.cache = new Map();
  }

  getText(start: number, end: number): string {
    return this.content.substring(start, end);
  }

  getLength(): number {
    return this.content.length;
  }

  getChangeRange(oldSnapshot: IScriptSnapshot): TextChangeRange | undefined {
    // Implementation
    return undefined;
  }

  dispose(): void {
    // Clean up parser
    this.parser.dispose();
    
    // Clear cache
    this.cache.clear();
    
    // Remove references
    this.parser = null as any;
    this.cache = null as any;
  }
}
```

## Incremental Updates

### Understanding Change Ranges

A `TextChangeRange` describes:
- **span**: The region in the old snapshot that changed
- **newLength**: The length of the new text that replaced it

**Example**:

```typescript
// Old: "Hello World"
// New: "Hello TypeScript World"
// Changed: "World" → "TypeScript World"

const changeRange: TextChangeRange = {
  span: {
    start: 6,    // Start of "World"
    length: 5,  // Length of "World"
  },
  newLength: 10, // Length of "TypeScript"
};
```

### Using Change Ranges

```typescript
function updateVirtualCode(
  virtualCode: VirtualCode,
  oldSnapshot: IScriptSnapshot,
  newSnapshot: IScriptSnapshot
): VirtualCode {
  const changeRange = newSnapshot.getChangeRange(oldSnapshot);

  if (!changeRange) {
    // Full recreation
    return createVirtualCode(newSnapshot);
  }

  // Incremental update
  return updateIncrementally(virtualCode, changeRange, newSnapshot);
}
```

### Incremental Update Pattern

```typescript
function updateIncrementally(
  virtualCode: VirtualCode,
  changeRange: TextChangeRange,
  newSnapshot: IScriptSnapshot
): VirtualCode {
  // Get unchanged parts
  const beforeChange = virtualCode.snapshot.getText(0, changeRange.span.start);
  const afterChange = virtualCode.snapshot.getText(
    changeRange.span.start + changeRange.span.length,
    virtualCode.snapshot.getLength()
  );

  // Get new changed part
  const newChangedPart = newSnapshot.getText(
    changeRange.span.start,
    changeRange.span.start + changeRange.newLength
  );

  // Rebuild virtual code
  const newContent = beforeChange + newChangedPart + afterChange;

  // Update mappings (shift offsets after change)
  const updatedMappings = updateMappings(
    virtualCode.mappings,
    changeRange
  );

  return {
    ...virtualCode,
    snapshot: createSnapshot(newContent),
    mappings: updatedMappings,
  };
}
```

### When to Use Incremental Updates

**Use incremental updates when**:
- Change range is small compared to file size
- Parsing is expensive
- Most of the file is unchanged

**Use full recreation when**:
- Change range is large (>50% of file)
- Change range cannot be determined
- Incremental update is complex

## Performance Considerations

### Caching Length

```typescript
class CachedLengthSnapshot implements IScriptSnapshot {
  private content: string;
  private cachedLength: number;

  constructor(content: string) {
    this.content = content;
    this.cachedLength = content.length; // Cache on creation
  }

  getLength(): number {
    return this.cachedLength; // O(1) lookup
  }

  getText(start: number, end: number): string {
    return this.content.substring(start, end);
  }

  getChangeRange(): TextChangeRange | undefined {
    return undefined;
  }
}
```

### Lazy String Creation

```typescript
class LazySnapshot implements IScriptSnapshot {
  private contentPromise: Promise<string>;
  private contentCache: string | undefined;

  constructor(contentPromise: Promise<string>) {
    this.contentPromise = contentPromise;
  }

  async ensureContent(): Promise<void> {
    if (!this.contentCache) {
      this.contentCache = await this.contentPromise;
    }
  }

  getText(start: number, end: number): string {
    if (!this.contentCache) {
      throw new Error('Content not loaded');
    }
    return this.contentCache.substring(start, end);
  }

  getLength(): number {
    if (!this.contentCache) {
      throw new Error('Content not loaded');
    }
    return this.contentCache.length;
  }

  getChangeRange(): TextChangeRange | undefined {
    return undefined;
  }
}
```

### Efficient Change Range Calculation

```typescript
class EfficientChangeTracker {
  private oldContent: string;
  private oldVersion: number;

  getChangeRange(
    oldSnapshot: IScriptSnapshot,
    newContent: string
  ): TextChangeRange | undefined {
    // Quick check: same content
    if (this.oldContent === newContent) {
      return undefined;
    }

    // Quick check: completely different
    if (this.oldContent.length === 0 || newContent.length === 0) {
      return {
        span: { start: 0, length: this.oldContent.length },
        newLength: newContent.length,
      };
    }

    // Calculate change range efficiently
    return this.calculateChangeRange(this.oldContent, newContent);
  }

  private calculateChangeRange(
    oldContent: string,
    newContent: string
  ): TextChangeRange {
    // Find first difference
    let start = 0;
    const minLength = Math.min(oldContent.length, newContent.length);
    while (start < minLength && oldContent[start] === newContent[start]) {
      start++;
    }

    // Find last difference
    let oldEnd = oldContent.length;
    let newEnd = newContent.length;
    while (oldEnd > start && newEnd > start &&
           oldContent[oldEnd - 1] === newContent[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    return {
      span: {
        start,
        length: oldEnd - start,
      },
      newLength: newEnd - start,
    };
  }
}
```

## Common Patterns

### Pattern 1: Simple String Snapshot

```typescript
function createSnapshot(content: string): IScriptSnapshot {
  return {
    getText: (start, end) => content.substring(start, end),
    getLength: () => content.length,
    getChangeRange: () => undefined,
  };
}
```

### Pattern 2: Snapshot with Version

```typescript
class VersionedSnapshot implements IScriptSnapshot {
  constructor(
    private content: string,
    public readonly version: number
  ) {}

  getText(start: number, end: number): string {
    return this.content.substring(start, end);
  }

  getLength(): number {
    return this.content.length;
  }

  getChangeRange(oldSnapshot: IScriptSnapshot): TextChangeRange | undefined {
    if (!(oldSnapshot instanceof VersionedSnapshot)) {
      return undefined;
    }

    if (this.version === oldSnapshot.version + 1) {
      // Can calculate change range
      return this.calculateChangeRange(oldSnapshot.content, this.content);
    }

    return undefined;
  }

  private calculateChangeRange(old: string, current: string): TextChangeRange {
    // Implementation
    return undefined;
  }
}
```

### Pattern 3: Snapshot Factory

```typescript
class SnapshotFactory {
  private snapshots = new Map<string, IScriptSnapshot>();

  createSnapshot(fileId: string, content: string): IScriptSnapshot {
    const snapshot: IScriptSnapshot = {
      getText: (start, end) => content.substring(start, end),
      getLength: () => content.length,
      getChangeRange: (oldSnapshot) => {
        const oldContent = this.getContent(oldSnapshot);
        if (!oldContent) return undefined;
        return this.calculateChangeRange(oldContent, content);
      },
      dispose: () => {
        this.snapshots.delete(fileId);
      },
    };

    this.snapshots.set(fileId, snapshot);
    return snapshot;
  }

  private getContent(snapshot: IScriptSnapshot): string | undefined {
    // Extract content from snapshot if possible
    return undefined;
  }

  private calculateChangeRange(old: string, current: string): TextChangeRange | undefined {
    // Implementation
    return undefined;
  }
}
```

### Pattern 4: Immutable Snapshot with Change Tracking

```typescript
class ImmutableSnapshot implements IScriptSnapshot {
  private readonly content: string;
  private readonly changeTracker: ChangeTracker;

  constructor(content: string, changeTracker: ChangeTracker) {
    this.content = content;
    this.changeTracker = changeTracker;
  }

  getText(start: number, end: number): string {
    return this.content.substring(start, end);
  }

  getLength(): number {
    return this.content.length;
  }

  getChangeRange(oldSnapshot: IScriptSnapshot): TextChangeRange | undefined {
    return this.changeTracker.getChangeRange(oldSnapshot, this.content);
  }
}
```

## Related Documentation

- [VirtualCode Complete Reference](./virtualcode-complete-reference.md) - Using snapshots in VirtualCode
- [Language Plugin Complete Guide](./language-plugin-complete-guide.md) - Creating snapshots in plugins
- [Mapping System Guide](./mapping-system-guide.md) - Mapping with snapshots
- [Advanced Patterns](./advanced-patterns.md) - Advanced snapshot patterns

