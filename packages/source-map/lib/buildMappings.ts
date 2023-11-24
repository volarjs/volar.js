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
			const mapping = [] as unknown as Mapping<T>;
			mapping[MappingKey.SOURCE_FILE] = segment[1];
			mapping[MappingKey.SOURCE_CODE_RANGE] = typeof segment[2] === 'number' ? [segment[2], segment[2] + segment[0].length] : segment[2];
			mapping[MappingKey.GENERATED_CODE_RANGE] = [length, length + segment[0].length];
			mapping[MappingKey.DATA] = segment[3]!;
			length += segment[0].length;
			mappings.push(mapping);
		}
	}
	return mappings;
}
