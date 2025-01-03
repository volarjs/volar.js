import { describe, expect, test } from 'vitest';
import { translateOffset } from '../lib/translateOffset';

describe('translateOffset', () => {
	test('start within fromRange, offset within toRange', () => {
		expect(translateOffset(5, [1], [11], [9])).toEqual(15);
	});

	test('start outside fromRange', () => {
		expect(translateOffset(0, [1], [11], [9])).toBeUndefined();
	});

	test('calculated offset outside toRange', () => {
		expect(translateOffset(11, [1], [11], [9])).toBeUndefined();
	});

	test('start at beginning of fromRange', () => {
		expect(translateOffset(1, [1], [11], [9])).toEqual(11);
	});

	test('start at end of fromRange', () => {
		expect(translateOffset(10, [1], [11], [9])).toEqual(20);
	});
	test('start at the end of fromRange with shorter toLength', () => {
		expect(translateOffset(10, [1], [11], [9], [7])).toEqual(18);
	});
});
