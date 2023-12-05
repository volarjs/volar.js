import type { Segment, StackNode } from 'muggle-string';

export interface Stack {
	source: string;
	range: [number, number];
}

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
		result.push({
			source: stack.stack,
			range: [start, offset],
		});
	}
	return result;
}
