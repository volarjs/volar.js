export function translateOffset(start: number, fromOffsets: number[], toOffsets: number[], fromLengths: number[], toLengths: number[] = fromLengths): number | undefined {
	for (let i = 0; i < fromOffsets.length; i++) {
		const fromOffset = fromOffsets[i];
		const fromLength = fromLengths[i];
		if (start >= fromOffset && start <= fromOffset + fromLength) {
			const toLength = toLengths[i];
			const toOffset = toOffsets[i];
			let rangeOffset = Math.min(start - fromOffset, toLength)
			return toOffset + rangeOffset;
		}
	}
}
