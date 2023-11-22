import { binarySearch } from './binarySearch';
import { translateOffset } from './translateOffset';

export type CodeRangeKey = 1 | 2;

export const sourceCodeRangeKey: CodeRangeKey = 1;
export const generatedCodeRangeKey: CodeRangeKey = 2;

export type Mapping<T = any> = [
	sourceFile: string | undefined,
	sourceCodeRange: [number, number],
	generatedCodeRange: [number, number],
	data: T,
];

export type Stack = [
	sourceFile: string,
	codeRange: [number, number],
];

interface RangeMemo<Data> {
	offsets: number[];
	mappings: Set<Mapping<Data>>[];
}

export class SourceMap<Data = any> {

	private sourceCodeRangeMemo: RangeMemo<Data> | undefined;
	private generatedCodeRangeMemo: RangeMemo<Data> | undefined;

	constructor(public readonly codeMappings: Mapping<Data>[]) { }

	getSourceOffset(generatedOffset: number, offsetBasedOnEnd = false) {
		for (const mapped of this.findMatching(generatedOffset, generatedCodeRangeKey, sourceCodeRangeKey, offsetBasedOnEnd)) {
			return mapped;
		}
	}

	getGeneratedOffset(sourceOffset: number, offsetBasedOnEnd = false) {
		for (const mapped of this.findMatching(sourceOffset, sourceCodeRangeKey, generatedCodeRangeKey, offsetBasedOnEnd)) {
			return mapped;
		}
	}

	getSourceOffsets(generatedOffset: number, offsetBasedOnEnd = false) {
		return this.findMatching(generatedOffset, generatedCodeRangeKey, sourceCodeRangeKey, offsetBasedOnEnd);
	}

	getGeneratedOffsets(sourceOffset: number, offsetBasedOnEnd = false) {
		return this.findMatching(sourceOffset, sourceCodeRangeKey, generatedCodeRangeKey, offsetBasedOnEnd);
	}

	* findMatching(offset: number, fromRange: CodeRangeKey, toRange: CodeRangeKey, offsetBasedOnEnd: boolean) {
		const memo = this.getMemoBasedOnRange(fromRange);
		if (memo.offsets.length === 0) return;

		const { low: start, high: end } = binarySearch(memo.offsets, offset);
		const skip = new Set<Mapping<Data>>();

		for (let i = start; i <= end; i++) {
			for (const mapping of memo.mappings[i]) {
				if (skip.has(mapping)) continue;
				skip.add(mapping);

				const mapped = translateOffset(offset, mapping[fromRange], mapping[toRange], offsetBasedOnEnd);
				if (mapped !== undefined) yield [mapped, mapping] as const;
			}
		}
	}

	private getMemoBasedOnRange(fromRange: CodeRangeKey) {
		return fromRange === sourceCodeRangeKey
			? this.sourceCodeRangeMemo ??= this.createMemo(sourceCodeRangeKey)
			: this.generatedCodeRangeMemo ??= this.createMemo(sourceCodeRangeKey);
	}

	private createMemo(key: CodeRangeKey): RangeMemo<Data> {
		const offsetsSet = new Set<number>();
		for (const mapping of this.codeMappings) {
			offsetsSet.add(mapping[key][0]);
			offsetsSet.add(mapping[key][1]);
		}

		const offsets = [...offsetsSet].sort((a, b) => a - b);
		const mappings = offsets.map(() => new Set<Mapping<Data>>());

		for (const mapping of this.codeMappings) {
			const startIndex = binarySearch(offsets, mapping[key][0]).match!;
			const endIndex = binarySearch(offsets, mapping[key][1]).match!;
			for (let i = startIndex; i <= endIndex; i++) {
				mappings[i].add(mapping);
			}
		}

		return { offsets, mappings };
	}
}
