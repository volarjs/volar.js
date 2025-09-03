import { describe, expect, it } from 'vitest';
import { combineChangeRanges } from '../lib/utils/combineChangeRanges';

describe(`combine change ranges`, () => {
	it(`12345 -> a12345 -> ab12345`, () => {
		expect(combineChangeRanges(
			{ span: { start: 0, length: 0 }, newLength: 1 },
			{ span: { start: 1, length: 0 }, newLength: 1 },
		)).toEqual({ span: { start: 0, length: 0 }, newLength: 2 });
	});

	it(`12345 -> a12345 -> ab12345 -> abc12345`, () => {
		expect(combineChangeRanges(
			{ span: { start: 0, length: 0 }, newLength: 1 },
			{ span: { start: 1, length: 0 }, newLength: 1 },
			{ span: { start: 2, length: 0 }, newLength: 1 },
		)).toEqual({ span: { start: 0, length: 0 }, newLength: 3 });
	});

	it(`12345 -> a12345 -> bb12345`, () => {
		expect(combineChangeRanges(
			{ span: { start: 0, length: 0 }, newLength: 1 },
			{ span: { start: 0, length: 1 }, newLength: 2 },
		)).toEqual({ span: { start: 0, length: 0 }, newLength: 2 });
	});

	it(`12345 -> 2345 -> b2345`, () => {
		expect(combineChangeRanges(
			{ span: { start: 0, length: 1 }, newLength: 0 },
			{ span: { start: 0, length: 0 }, newLength: 1 },
		)).toEqual({ span: { start: 0, length: 1 }, newLength: 1 });
	});

	it(`12345 -> a12345 -> b12345`, () => {
		expect(combineChangeRanges(
			{ span: { start: 0, length: 0 }, newLength: 1 },
			{ span: { start: 0, length: 1 }, newLength: 1 },
		)).toEqual({ span: { start: 0, length: 0 }, newLength: 1 });
	});

	it(`12345 -> a12345 -> bb2345`, () => {
		expect(combineChangeRanges(
			{ span: { start: 0, length: 0 }, newLength: 1 },
			{ span: { start: 0, length: 2 }, newLength: 2 },
		)).toEqual({ span: { start: 0, length: 1 }, newLength: 2 });
	});

	it(`12345 -> a2345 -> b2345`, () => {
		expect(combineChangeRanges(
			{ span: { start: 0, length: 1 }, newLength: 1 },
			{ span: { start: 0, length: 1 }, newLength: 1 },
		)).toEqual({ span: { start: 0, length: 1 }, newLength: 1 });
	});

	it(`12345 -> 1a2345 -> ba2345`, () => {
		expect(combineChangeRanges(
			{ span: { start: 1, length: 0 }, newLength: 1 },
			{ span: { start: 0, length: 1 }, newLength: 1 },
		)).toEqual({ span: { start: 0, length: 1 }, newLength: 2 });
	});

	it(`12345 -> 1a2345 -> bb2345`, () => {
		expect(combineChangeRanges(
			{ span: { start: 1, length: 0 }, newLength: 1 },
			{ span: { start: 0, length: 2 }, newLength: 2 },
		)).toEqual({ span: { start: 0, length: 1 }, newLength: 2 });
	});

	it(`12345 -> 1a2345 -> bba2345`, () => {
		expect(combineChangeRanges(
			{ span: { start: 1, length: 0 }, newLength: 1 },
			{ span: { start: 0, length: 1 }, newLength: 2 },
		)).toEqual({ span: { start: 0, length: 1 }, newLength: 3 });
	});

	it(`12345 -> 12a45 -> 1bbb5`, () => {
		expect(combineChangeRanges(
			{ span: { start: 2, length: 1 }, newLength: 1 },
			{ span: { start: 1, length: 3 }, newLength: 3 },
		)).toEqual({ span: { start: 1, length: 3 }, newLength: 3 });
	});

	it(`12345 -> a12345 -> a1b2345`, () => {
		expect(combineChangeRanges(
			{ span: { start: 0, length: 0 }, newLength: 1 },
			{ span: { start: 2, length: 0 }, newLength: 1 },
		)).toEqual({ span: { start: 0, length: 1 }, newLength: 3 });
	});

	it(`12345 -> 12a345 -> b2a345`, () => {
		expect(combineChangeRanges(
			{ span: { start: 2, length: 0 }, newLength: 1 },
			{ span: { start: 0, length: 1 }, newLength: 1 },
		)).toEqual({ span: { start: 0, length: 2 }, newLength: 3 });
	});

	it(`12345 -> aa12345 -> a12345`, () => {
		expect(combineChangeRanges(
			{ span: { start: 0, length: 0 }, newLength: 2 },
			{ span: { start: 1, length: 1 }, newLength: 0 },
		)).toEqual({ span: { start: 0, length: 0 }, newLength: 1 });
	});
});
