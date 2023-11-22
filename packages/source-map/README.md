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

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.
