import type { Segment } from 'muggle-string';
import { MappingKey, type Mapping } from './sourceMap';

export function buildMappings<T>(chunks: Segment<T>[]) {
	let length = 0;
	const mappings: Mapping<T>[] = [];
	for (const segment of chunks) {
		if (typeof segment === 'string') {
			length += segment.length;
		}
		else {
			mappings.push([
				segment[1],
				typeof segment[2] === 'number' ? [segment[2], segment[2] + segment[0].length] : segment[2],
				[length, length + segment[0].length],
				segment[MappingKey.DATA]!,
			]);
			length += segment[0].length;
		}
	}
	return mappings;
}
