export function translateOffset(start: number, fromRange: [number, number], toRange: [number, number], offsetBasedOnEnd: boolean): number | undefined {
	if (start >= fromRange[0] && start <= fromRange[1]) {
		let offset = toRange[0] + start - fromRange[0];
		if (offsetBasedOnEnd) {
			offset += (toRange[1] - toRange[0]) - (fromRange[1] - fromRange[0]);
		}
		if (offset >= toRange[0] && offset <= toRange[1]) {
			return offset;
		}
	}
}
