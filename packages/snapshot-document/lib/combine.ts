import type * as ts from 'typescript';

export function combineChangeRanges(...changeRanges: ts.TextChangeRange[]) {
	let changeRange: ts.TextChangeRange = changeRanges[0];
	for (let i = 1; i < changeRanges.length; i++) {
		const nextChangeRange = changeRanges[i];
		changeRange = combineTwoChanges(changeRange, nextChangeRange);
	}
	return changeRange;
}

// https://tsplay.dev/mMldVN - @browsnet
function combineTwoChanges(a: ts.TextChangeRange, b: ts.TextChangeRange): ts.TextChangeRange {
	const aStart = a.span.start;
	const aEnd = a.span.start + a.span.length;
	const aDiff = a.newLength - a.span.length;
	const changeBegin = aStart + Math.min(a.span.length, a.newLength);
	const rollback = (start: number) => start > changeBegin ? Math.max(aStart, start - aDiff) : start;
	const bStart = rollback(b.span.start);
	const bEnd = rollback(b.span.start + b.span.length);
	const bDiff = b.newLength - b.span.length;
	const start = Math.min(aStart, bStart);
	const end = Math.max(aEnd, bEnd);
	const length = end - start;
	const newLength = aDiff + bDiff + length;
	return { span: { start, length }, newLength };
}
