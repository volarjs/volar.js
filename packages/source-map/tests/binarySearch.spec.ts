import { describe, expect, test } from 'vitest';
import { binarySearch } from '../lib/binarySearch';

describe('binarySearch', () => {
	test('value between elements', () => {
		expect(binarySearch([1, 3, 5, 7, 9], 4)).toEqual({ low: 1, high: 2, match: undefined });
	});

	test('value less than first element', () => {
		expect(binarySearch([1, 3, 5, 7, 9], 0)).toEqual({ low: 0, high: 0, match: undefined });
	});

	test('value greater than last element', () => {
		expect(binarySearch([1, 3, 5, 7, 9], 10)).toEqual({ low: 4, high: 4, match: undefined });
	});

	test('empty array', () => {
		expect(binarySearch([], 1)).toEqual({ low: 0, high: -1, match: undefined });
	});

	test('value at start of array', () => {
		expect(binarySearch([1, 3, 5, 7, 9], 1)).toEqual({ low: 0, high: 0, match: 0 });
	});

	test('value at end of array', () => {
		expect(binarySearch([1, 3, 5, 7, 9], 9)).toEqual({ low: 4, high: 4, match: 4 });
	});

	test('single element array, value matches', () => {
		expect(binarySearch([1], 1)).toEqual({ low: 0, high: 0, match: 0 });
	});

	test('single element array, value does not match', () => {
		expect(binarySearch([1], 2)).toEqual({ low: 0, high: 0, match: undefined });
	});

	test('two elements array, value matches first', () => {
		expect(binarySearch([1, 2], 1)).toEqual({ low: 0, high: 0, match: 0 });
	});

	test('two elements array, value matches second', () => {
		expect(binarySearch([1, 2], 2)).toEqual({ low: 1, high: 1, match: 1 });
	});

	test('two elements array, value does not match', () => {
		expect(binarySearch([1, 2], 3)).toEqual({ low: 1, high: 1, match: undefined });
	});
});
