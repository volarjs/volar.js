import type { Segment, StackNode } from 'muggle-string';
import type { Stack } from './sourceMap';

export function buildStacks<T>(chunks: Segment<T>[], stacks: StackNode[]) {
	let offset = 0;
	let index = 0;
	const result: Stack[] = [];
	for (const stack of stacks) {
		const start = offset;
		for (let i = 0; i < stack.length; i++) {
			const segment = chunks[index + i];
			if (typeof segment === 'string') {
				offset += segment.length;
			}
			else {
				offset += segment[0].length;
			}
		}
		index += stack.length;
		result.push([
			stack.stack,
			[start, offset],
		]);
	}
	return result;
}
