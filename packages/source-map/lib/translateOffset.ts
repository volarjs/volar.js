let warned = false;

export function translateOffset(
	start: number,
	fromOffsets: number[],
	toOffsets: number[],
	fromLengths: number[],
	toLengths: number[] = fromLengths,
): number | undefined {
	const isSorted = fromOffsets.every((value, index) => index === 0 || fromOffsets[index - 1] <= value);
	if (!isSorted) {
		for (let i = 0; i < fromOffsets.length; i++) {
			const fromOffset = fromOffsets[i];
			const fromLength = fromLengths[i];
			if (start >= fromOffset && start <= fromOffset + fromLength) {
				const toLength = toLengths[i];
				const toOffset = toOffsets[i];
				let rangeOffset = Math.min(start - fromOffset, toLength);
				return toOffset + rangeOffset;
			}
		}
		if (!warned) {
			warned = true;
			console.warn('fromOffsets should be sorted in ascending order');
		}
	}

	let low = 0;
	let high = fromOffsets.length - 1;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const fromOffset = fromOffsets[mid];
		const fromLength = fromLengths[mid];

		if (start >= fromOffset && start <= fromOffset + fromLength) {
			const toLength = toLengths[mid];
			const toOffset = toOffsets[mid];
			let rangeOffset = Math.min(start - fromOffset, toLength);
			return toOffset + rangeOffset;
		}
		else if (start < fromOffset) {
			high = mid - 1;
		}
		else {
			low = mid + 1;
		}
	}
}
