import { describe, expect, test } from 'vitest';
import { SpanMapKind } from '../lib/spanMap';
import { translateOffset } from '../lib/translateOffset';

describe('translateOffset', () => {
	test('start within fromRange, offset within toRange', () => {
		expect(translateOffset(5, 1, 9, 11, 9)).toEqual(15);
	});

	test('start outside fromRange', () => {
		expect(translateOffset(0, 1, 9, 11, 9)).toBeUndefined();
		expect(translateOffset(11, 1, 9, 11, 9)).toBeUndefined();
	});

	test('start at beginning of fromRange', () => {
		expect(translateOffset(1, 1, 9, 11, 9)).toEqual(11);
	});

	test('start at end of fromRange', () => {
		expect(translateOffset(10, 1, 9, 11, 9)).toEqual(20);
	});

	test('atom edges map to edges', () => {
		expect(translateOffset(1, 1, 9, 11, 3, SpanMapKind.Atom)).toEqual(11);
		expect(translateOffset(10, 1, 9, 11, 3, SpanMapKind.Atom)).toEqual(14);
	});

	test('atom interior clamps to the start, or to the end when preferEnd is true', () => {
		expect(translateOffset(5, 1, 9, 11, 3, SpanMapKind.Atom)).toEqual(11);
		expect(translateOffset(5, 1, 9, 11, 3, SpanMapKind.Alias, true)).toEqual(14);
	});

	test('zero-length atom maps to its start, or to its end when preferEnd is true', () => {
		expect(translateOffset(1, 1, 0, 11, 3, SpanMapKind.Atom)).toEqual(11);
		expect(translateOffset(1, 1, 0, 11, 3, SpanMapKind.Atom, true)).toEqual(14);
	});
});
