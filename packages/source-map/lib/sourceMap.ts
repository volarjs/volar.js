import { binarySearch } from './binarySearch';
import type { Mapping } from './spanMap';
import { translateOffset } from './translateOffset';

type CodeRangeKey = 'source' | 'generated';

interface MappingMemo {
	offsets: number[];
	mappings: Set<Mapping>[];
}

export class SourceMap {
	private sourceCodeOffsetsMemo: MappingMemo | undefined;
	private generatedCodeOffsetsMemo: MappingMemo | undefined;

	constructor(public readonly mappings: Mapping[]) {}

	toSourceRange(
		generatedStart: number,
		generatedEnd: number,
		fallbackToAnyMatch: boolean,
		filter?: (features: number) => boolean,
	) {
		return this.findMatchingStartEnd(generatedStart, generatedEnd, fallbackToAnyMatch, 'generated', filter);
	}

	toGeneratedRange(
		sourceStart: number,
		sourceEnd: number,
		fallbackToAnyMatch: boolean,
		filter?: (features: number) => boolean,
	) {
		return this.findMatchingStartEnd(sourceStart, sourceEnd, fallbackToAnyMatch, 'source', filter);
	}

	toSourceLocation(generatedOffset: number, filter?: (features: number) => boolean) {
		return this.findMatchingOffsets(generatedOffset, 'generated', filter);
	}

	toGeneratedLocation(sourceOffset: number, filter?: (features: number) => boolean) {
		return this.findMatchingOffsets(sourceOffset, 'source', filter);
	}

	*findMatchingOffsets(
		offset: number,
		fromRange: CodeRangeKey,
		filter?: (features: number) => boolean,
		preferEnd: boolean = false,
	) {
		const memo = this.getMemoBasedOnRange(fromRange);
		if (memo.offsets.length === 0) {
			return;
		}

		const { low: start, high: end } = binarySearch(memo.offsets, offset);
		const skip = new Set<Mapping>();

		for (let i = start; i <= end; i++) {
			for (const mapping of memo.mappings[i]) {
				if (skip.has(mapping)) {
					continue;
				}
				skip.add(mapping);

				if (filter && !filter(mapping[5])) {
					continue;
				}

				const mapped = translate(offset, mapping, fromRange, preferEnd);
				if (mapped !== undefined) {
					yield [mapped, mapping] as const;
				}
			}
		}
	}

	*findMatchingStartEnd(
		start: number,
		end: number,
		fallbackToAnyMatch: boolean,
		fromRange: CodeRangeKey,
		filter?: (features: number) => boolean,
	): Generator<[mappedStart: number, mappedEnd: number, startMapping: Mapping, endMapping: Mapping]> {
		const mappedStarts: [number, Mapping][] = [];
		let hadMatch = false;
		for (const [mappedStart, mapping] of this.findMatchingOffsets(start, fromRange)) {
			if (filter && !filter(mapping[5])) {
				continue;
			}
			mappedStarts.push([mappedStart, mapping]);
			const mappedEnd = translate(end, mapping, fromRange, true);
			if (mappedEnd !== undefined) {
				hadMatch = true;
				yield [mappedStart, mappedEnd, mapping, mapping] as const;
			}
		}
		if (!hadMatch && fallbackToAnyMatch) {
			for (const [mappedStart, mappingStart] of mappedStarts) {
				for (const [mappedEnd, mappingEnd] of this.findMatchingOffsets(end, fromRange, undefined, true)) {
					if (filter && !filter(mappingEnd[5]) || mappedEnd < mappedStart) {
						continue;
					}
					yield [mappedStart, mappedEnd, mappingStart, mappingEnd] as const;
					break;
				}
			}
		}
	}

	private getMemoBasedOnRange(fromRange: CodeRangeKey) {
		return fromRange === 'source'
			? this.sourceCodeOffsetsMemo ??= this.createMemo('source')
			: this.generatedCodeOffsetsMemo ??= this.createMemo('generated');
	}

	private createMemo(key: CodeRangeKey): MappingMemo {
		const startIndex = key === 'source' ? 2 : 0;
		const offsetsSet = new Set<number>();
		for (const mapping of this.mappings) {
			offsetsSet.add(mapping[startIndex]);
			offsetsSet.add(mapping[startIndex] + mapping[startIndex + 1]);
		}

		const offsets = [...offsetsSet].sort((a, b) => a - b);
		const mappings = offsets.map(() => new Set<Mapping>());

		for (const mapping of this.mappings) {
			const startOffset = binarySearch(offsets, mapping[startIndex]).match!;
			const endOffset = binarySearch(offsets, mapping[startIndex] + mapping[startIndex + 1]).match!;
			for (let i = startOffset; i <= endOffset; i++) {
				mappings[i].add(mapping);
			}
		}

		return { offsets, mappings };
	}
}

function translate(offset: number, mapping: Mapping, fromRange: CodeRangeKey, preferEnd: boolean) {
	const [generatedStart, generatedLength, sourceStart, sourceLength, kind] = mapping;
	return fromRange === 'source'
		? translateOffset(offset, sourceStart, sourceLength, generatedStart, generatedLength, kind, preferEnd)
		: translateOffset(offset, generatedStart, generatedLength, sourceStart, sourceLength, kind, preferEnd);
}
