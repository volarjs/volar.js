# @volar/source-map

Provides functionality related to source maps.

## API

This package exports a `SourceMap` class with the following methods:

- `getSourceOffset(generatedOffset: number, offsetBasedOnEnd = false)`: Returns the source offset for a given generated offset.

- `getGeneratedOffset(sourceOffset: number, offsetBasedOnEnd = false)`: Returns the generated offset for a given source offset.

- `getSourceOffsets(generatedOffset: number, offsetBasedOnEnd = false)`: Returns all source offsets for a given generated offset.

- `getGeneratedOffsets(sourceOffset: number, offsetBasedOnEnd = false)`: Returns all generated offsets for a given source offset.

### `offsetBasedOnEnd`

The `offsetBasedOnEnd` parameter is used in several methods in the `SourceMap` class. If `offsetBasedOnEnd` is true, the offset is based on the end of the range. This can be useful in certain situations where you want to calculate the offset from the end of the range instead of the beginning.

## Data Structures

### `Mapping`

The `Mapping` is a tuple that represents a mapping in the source map. It consists of the following elements:

- `sourceFile`: A string representing the source file. This can be `undefined`.
- `sourceCodeRange`: A tuple of two numbers representing the start and end offsets in the source code.
- `generatedCodeRange`: A tuple of two numbers representing the start and end offsets in the generated code.
- `data`: The data associated with this mapping. The type of this data is generic and can be specified when creating a `SourceMap` instance.

Here is an example of a `Mapping`:

```ts
let mapping: Mapping<MyDataType> = [
    '.../sourceFile.ts', // sourceFile
    [10, 20], // sourceCodeRange
    [30, 40], // generatedCodeRange
    myData, // data
];
```

In this example, `myData` is of type `MyDataType`, which is the type specified for the SourceMap instance.

Remember to replace `MyDataType` and `myData` with actual types and data that are relevant to your project.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.
