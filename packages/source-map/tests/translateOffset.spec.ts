import { describe, expect, test } from 'vitest';
import { translateOffset } from '../lib/translateOffset';

describe('translateOffset', () => {
	test('start within fromRange, offset within toRange', () => {
		expect(translateOffset(5, [1, 10], [11, 20], false)).toEqual(15);
	});

	test('start outside fromRange', () => {
		expect(translateOffset(0, [1, 10], [11, 20], false)).toBeUndefined();
	});

	test('calculated offset outside toRange', () => {
		expect(translateOffset(10, [1, 10], [11, 15], false)).toBeUndefined();
	});

	test('offsetBasedOnEnd is true', () => {
		expect(translateOffset(5, [1, 10], [11, 20], true)).toEqual(15);
	});

	test('start at beginning of fromRange', () => {
		expect(translateOffset(1, [1, 10], [11, 20], false)).toEqual(11);
	});

	test('start at end of fromRange', () => {
		expect(translateOffset(10, [1, 10], [11, 20], false)).toEqual(20);
	});

	test('start equals fromRange end, offsetBasedOnEnd true', () => {
		expect(translateOffset(10, [1, 10], [11, 20], true)).toEqual(20);
	});
});
