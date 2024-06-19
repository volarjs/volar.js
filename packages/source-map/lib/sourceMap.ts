import { binarySearch } from './binarySearch';
import { areRangesSortedAndNonOverlapping } from "./translateOffset";

export type CodeRangeKey = 'sourceOffsets' | 'generatedOffsets';

export interface Mapping<Data = unknown> {
	sourceOffsets: number[];
	generatedOffsets: number[];
	lengths: number[];
	generatedLengths?: number[];
	data: Data;
}

export class SourceMap<Data = unknown> {

	private sourceCodeOffsetsStorage: BinarySearchStorage<Data> | undefined;
	private generatedCodeOffsetsStorage: BinarySearchStorage<Data> | undefined;

	constructor(public readonly mappings: Mapping<Data>[]) {
	}

	getSourceStartEnd(generatedStart: number, generatedEnd: number, filter?: (data: Data) => boolean): Generator<[start: number, end: number, Mapping<Data>]> {
		return this.findMatchingStartEnd(generatedStart, generatedEnd, 'generatedOffsets', filter);
	}

	getGeneratedStartEnd(sourceStart: number, sourceEnd: number, filter?: (data: Data) => boolean): Generator<[start: number, end: number, Mapping<Data>]> {
		return this.findMatchingStartEnd(sourceStart, sourceEnd, 'sourceOffsets', filter);
	}

	getSourceOffsets(generatedOffset: number, filter?: (data: Data) => boolean): Generator<[offset: number, Mapping<Data>]> {
		return this.findMatchingOffsets(generatedOffset, 'generatedOffsets', filter);
	}

	getGeneratedOffsets(sourceOffset: number, filter?: (data: Data) => boolean): Generator<[offset: number, Mapping<Data>]> {
		return this.findMatchingOffsets(sourceOffset, 'sourceOffsets', filter);
	}

	* findMatchingOffsets(offset: number, fromRange: CodeRangeKey, filter?: (data: Data) => boolean): Generator<[number, Mapping<Data>]> {
		const toRange: CodeRangeKey = fromRange == 'sourceOffsets' ? 'generatedOffsets' : 'sourceOffsets'
		for (const match of this.getStorageBasedOnRange(fromRange).findMatchingMappingIndexes(offset, filter)) {
			yield [mapOffset(match, offset, fromRange, toRange), match[0]];
		}
	}

	* findMatchingStartEnd(start: number, end: number, fromRange: CodeRangeKey, filter?: (data: Data) => boolean): Generator<[start: number, end: number, Mapping<Data>]> {
		const length = end - start
		if (length < 0) {
			return
		}
		if (length == 0) {
			for (const match of this.findMatchingOffsets(start, fromRange, filter)) {
				yield [match[0], 0, match[1]]
			}
			return
		}

		const startMatches: [Mapping<Data>, number][] = []
		const startMatchesMap = new Map<Mapping<Data>, Set<number>>()
		for (const [startMapping, index] of this.getStorageBasedOnRange(fromRange).findMatchingMappingIndexes(start, filter)) {
			startMatches.push([startMapping, index])
			let set = startMatchesMap.get(startMapping)
			if (!set) {
				set = new Set()
				startMatchesMap.set(startMapping, set)
			}
			set.add(index)
		}

		const perfectMatches: [Mapping<Data>, number][] = []
		const endMatches: [Mapping<Data>, number][] = []
		for (const endMapping of this.getStorageBasedOnRange(fromRange).findMatchingMappingIndexes(start + length, filter)) {
			const startMappingIndexes = startMatchesMap.get(endMapping[0])
			if (startMappingIndexes && startMappingIndexes.has(endMapping[1])) {
				perfectMatches.push(endMapping)
			} else if (perfectMatches.length == 0) {
				endMatches.push(endMapping)
			}
		}

		const toRange: CodeRangeKey = fromRange == 'sourceOffsets' ? 'generatedOffsets' : 'sourceOffsets'
		if (perfectMatches.length > 0) {
			// Prefer the shortest mapping ranges
			perfectMatches.sort((a, b) => getSpanLength(a, fromRange) - getSpanLength(b, fromRange))

			for (const match of perfectMatches) {
				const fromStartOffset = getStartOffset(match, fromRange)
				const toStartOffset = getStartOffset(match, toRange)
				const toLength = getSpanLength(match, toRange)
				const fromLength = getSpanLength(match, fromRange)
				if (toLength == fromLength) {
					// `from` and `to` span mappings have the same length - map range verbatim
					const startOffset = toStartOffset + start - fromStartOffset
					yield [startOffset, startOffset + length, match[0]]
				} else if (fromStartOffset == start && fromLength == length) {
					// The whole `from` span is selected - map to the whole `to` span
					yield [toStartOffset, toStartOffset + toLength, match[0]]
				} else {
					// We would need to do some heuristics here to map the span, and it would make little
					// sense in terms of mapping accuracy.
					// Try the next match.
				}
			}
		} else {
			// Prefer the shortest `from` spans
			startMatches.sort((a, b) =>
				getSpanLength(a, fromRange) - getSpanLength(b, fromRange))
			endMatches.sort((a, b) =>
				getSpanLength(a, fromRange) - getSpanLength(b, fromRange))

			for (const startMatch of startMatches) {
				let mapping = startMatch[0];

				for (const endMatch of endMatches) {
					if (endMatch[0] != mapping) {
						continue
					}
					const startOffset = mapOffset(startMatch, start, fromRange, toRange)
					const endOffset = mapOffset(endMatch, end, fromRange, toRange)
					yield [startOffset, endOffset, mapping]
				}
			}
		}
	}

	private getStorageBasedOnRange(fromRange: CodeRangeKey) {
		return fromRange === 'sourceOffsets'
			? this.sourceCodeOffsetsStorage ??= this.createStorage('sourceOffsets')
			: this.generatedCodeOffsetsStorage ??= this.createStorage('generatedOffsets');
	}

	private createStorage(key: CodeRangeKey): BinarySearchStorage<Data> {
		if (!this.mappings.every(mapping => areRangesSortedAndNonOverlapping(mapping[key], getLengths(mapping, key)))) {
			throw new Error("Ranges within one mapping should be sorted and non-overlapping.")
		}
		return new BinarySearchStorage<Data>(this.mappings, key)
	}

}

class BinarySearchStorage<Data> {

	private readonly offsets: number[];
	private readonly mappings: Set<Mapping<Data>>[];

	constructor(originalMappings: Mapping<Data>[], private readonly key: CodeRangeKey) {
		const offsetsSet = new Set<number>();
		for (const mapping of originalMappings) {
			for (let i = 0; i < mapping[key].length; i++) {
				offsetsSet.add(mapping[key][i]);
				offsetsSet.add(mapping[key][i] + getLengths(mapping, key)[i]);
			}
		}

		const offsets = [...offsetsSet].sort((a, b) => a - b);
		const mappings = offsets.map(() => new Set<Mapping<Data>>());

		for (const mapping of originalMappings) {
			for (let i = 0; i < mapping[key].length; i++) {
				const startIndex = binarySearch(offsets, mapping[key][i]).match!;
				const endIndex = binarySearch(offsets, mapping[key][i] + getLengths(mapping, key)[i]).match!;
				for (let i = startIndex; i <= endIndex; i++) {
					mappings[i].add(mapping);
				}
			}
		}
		this.offsets = offsets
		this.mappings = mappings
	}

	* findMatchingMappingIndexes(offset: number, filter: ((data: Data) => boolean) | undefined): Generator<[Mapping<Data>, number]> {
		if (this.offsets.length === 0) {
			return;
		}

		const fromRange = this.key

		const { low: start, high: end } = binarySearch(this.offsets, offset);
		const skip = new Set<Mapping>();

		for (let i = start; i <= end; i++) {
			for (const mapping of this.mappings[i]) {
				if (skip.has(mapping)) {
					continue;
				}
				skip.add(mapping);
				if (filter && !filter(mapping.data)) {
					continue;
				}

				const fromOffsets = mapping[fromRange]
				const fromLengths = getLengths(mapping, fromRange)
				let low = 0;
				let high = fromOffsets.length - 1;

				while (low <= high) {
					const mid = Math.floor((low + high) / 2);
					const fromOffset = fromOffsets[mid];
					const fromLength = fromLengths[mid];

					if (offset >= fromOffset && offset <= fromOffset + fromLength) {
						yield [mapping, mid]
						break;
					} else if (offset < fromOffset) {
						high = mid - 1;
					} else {
						low = mid + 1;
					}
				}
			}
		}
	}
}

function getLengths(mapping: Mapping, key: CodeRangeKey) {
	return key == 'sourceOffsets' ? mapping.lengths : mapping.generatedLengths ?? mapping.lengths;
}

function getStartOffset<Data>(mappingIndex: [Mapping<Data>, number], rangeKey: CodeRangeKey) {
	const [mapping, index] = mappingIndex
	return mapping[rangeKey][index]
}

function getSpanLength<Data>(mappingIndex: [Mapping<Data>, number], rangeKey: CodeRangeKey): number {
	const [mapping, index] = mappingIndex
	return getLengths(mapping, rangeKey)[index]
}

function mapOffset<Data>(
	mappingIndex: [Mapping<Data>, number], offset: number,
	fromRange: CodeRangeKey, toRange: CodeRangeKey
): number {
	const fromOffset = getStartOffset(mappingIndex, fromRange)
	const toOffset = getStartOffset(mappingIndex, toRange)
	if (fromOffset == offset) {
		return toOffset
	} else {
		const toLength = getSpanLength(mappingIndex, toRange)
		return toOffset + Math.min(offset - fromOffset, toLength)
	}
}
