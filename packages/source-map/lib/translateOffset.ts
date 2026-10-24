import { SpanMapKind } from './spanMap';

export function translateOffset(
	offset: number,
	fromStart: number,
	fromLength: number,
	toStart: number,
	toLength: number,
	kind: SpanMapKind = SpanMapKind.Verbatim,
	preferEnd: boolean = false,
): number | undefined {
	const relative = offset - fromStart;
	if (relative < 0 || relative > fromLength) {
		return;
	}
	if (kind === SpanMapKind.Verbatim) {
		return toStart + Math.min(relative, toLength);
	}
	if (relative === 0 && (fromLength > 0 || !preferEnd)) {
		return toStart;
	}
	if (relative === fromLength || preferEnd) {
		return toStart + toLength;
	}
	return toStart;
}
