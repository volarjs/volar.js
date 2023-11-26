import type { Segment } from 'muggle-string';
import type { Mapping } from './sourceMap';

export function buildMappings<T>(chunks: Segment<T>[]) {
	let length = 0;
	const mappings: Mapping<T>[] = [];
	for (const segment of chunks) {
		if (typeof segment === 'string') {
			length += segment.length;
		}
		else {
			mappings.push({
				source: segment[1],
				sourceOffsets: [typeof segment[2] === 'number' ? segment[2] : segment[2][0]],
				generatedOffsets: [length],
				lengths: [segment[0].length],
				data: segment[3]!,
			});
			length += segment[0].length;
		}
	}
	return mappings;
}
