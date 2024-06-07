import { binarySearch } from './binarySearch';
import { translateOffset } from './translateOffset';

export type CodeRangeKey = 'sourceOffsets' | 'generatedOffsets';

export interface Mapping<Data = unknown> {
	sourceOffsets: number[];
	generatedOffsets: number[];
	lengths: number[];
	generatedLengths?: number[];
	data: Data;
}

interface MappingMemo {
	offsets: number[];
	mappings: Set<Mapping>[];
}

export class SourceMap<Data = unknown> {

	private sourceCodeOffsetsMemo: MappingMemo | undefined;
	private generatedCodeOffsetsMemo: MappingMemo | undefined;

	constructor(public readonly mappings: Mapping<Data>[]) { }

	getSourceOffsets(generatedOffset: number) {
		return this.findMatching(generatedOffset, 'generatedOffsets', 'sourceOffsets');
	}

	getGeneratedOffsets(sourceOffset: number) {
		return this.findMatching(sourceOffset, 'sourceOffsets', 'generatedOffsets');
	}

	* findMatching(offset: number, fromRange: CodeRangeKey, toRange: CodeRangeKey) {
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

				const mapped = translateOffset(offset, mapping[fromRange], mapping[toRange], getLengths(mapping, fromRange), getLengths(mapping, toRange));
				if (mapped !== undefined) {
					yield [mapped, mapping as Mapping<Data>] as const;
				}
			}
		}
	}

	private getMemoBasedOnRange(fromRange: CodeRangeKey) {
		return fromRange === 'sourceOffsets'
			? this.sourceCodeOffsetsMemo ??= this.createMemo('sourceOffsets')
			: this.generatedCodeOffsetsMemo ??= this.createMemo('generatedOffsets');
	}

	private createMemo(key: CodeRangeKey): MappingMemo {
		const offsetsSet = new Set<number>();
		for (const mapping of this.mappings) {
			for (let i = 0; i < mapping[key].length; i++) {
				offsetsSet.add(mapping[key][i]);
				offsetsSet.add(mapping[key][i] + getLengths(mapping, key)[i]);
			}
		}

		const offsets = [...offsetsSet].sort((a, b) => a - b);
		const mappings = offsets.map(() => new Set<Mapping<Data>>());

		for (const mapping of this.mappings) {
			for (let i = 0; i < mapping[key].length; i++) {
				const startIndex = binarySearch(offsets, mapping[key][i]).match!;
				const endIndex = binarySearch(offsets, mapping[key][i] + getLengths(mapping, key)[i]).match!;
				for (let i = startIndex; i <= endIndex; i++) {
					mappings[i].add(mapping);
				}
			}
		}

		return { offsets, mappings };
	}
}

function getLengths(mapping: Mapping, key: CodeRangeKey) {
	return key == 'sourceOffsets' ? mapping.lengths : mapping.generatedLengths ?? mapping.lengths;
}
