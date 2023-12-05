export function translateOffset(start: number, fromOffsets: number[], toOffsets: number[], lengths: number[]): number | undefined {
	for (let i = 0; i < fromOffsets.length; i++) {
		const fromOffset = fromOffsets[i];
		const toOffset = toOffsets[i];
		const length = lengths[i];
		if (start >= fromOffset && start <= fromOffset + length) {
			return toOffset + start - fromOffset;
		}
	}
}
