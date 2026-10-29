import { describe, expect, it } from 'vitest';
import { defaultMapperFactory, findOverlapCodeRange, mapping, SpanMapKind } from '../index';

// test code: <html><body><p>Hello</p></body></html>

describe(`Test findOverlapCodeRange()`, () => {
	it('signal mapping', () => {
		const map = defaultMapperFactory([mapping(0, 38, 0, 38, 0)]);

		expect(findOverlapCodeRange(0, 38, map, () => true)).toEqual({ start: 0, end: 38 });
		expect(findOverlapCodeRange(6, 31, map, () => true)).toEqual({ start: 6, end: 31 });
	});

	it('fallback to valid range', () => {
		const map = defaultMapperFactory([mapping(6, 25, 6, 25, 0)]);

		expect(findOverlapCodeRange(5, 32, map, () => true)).toEqual({ start: 6, end: 31 });
		expect(findOverlapCodeRange(7, 32, map, () => true)).toEqual({ start: 7, end: 31 });
		expect(findOverlapCodeRange(5, 30, map, () => true)).toEqual({ start: 6, end: 30 });
	});

	it('fallback to valid range (offset)', () => {
		const map = defaultMapperFactory([mapping(7, 25, 6, 25, 0)]);

		expect(findOverlapCodeRange(5, 32, map, () => true)).toEqual({ start: 7, end: 32 });
		expect(findOverlapCodeRange(7, 32, map, () => true)).toEqual({ start: 8, end: 32 });
		expect(findOverlapCodeRange(5, 30, map, () => true)).toEqual({ start: 7, end: 31 });
	});

	it('fallback to the whole atom', () => {
		const map = defaultMapperFactory([[7, 23, 6, 25, SpanMapKind.Atom, 0]]);

		expect(findOverlapCodeRange(5, 32, map, () => true)).toEqual({ start: 7, end: 30 });
		expect(findOverlapCodeRange(7, 32, map, () => true)).toEqual({ start: 7, end: 30 });
		expect(findOverlapCodeRange(5, 26, map, () => true)).toEqual({ start: 7, end: 30 });
		expect(findOverlapCodeRange(6, 31, map, () => true)).toEqual({ start: 7, end: 30 });
	});

	it('mutilple mappings', () => {
		const map = defaultMapperFactory([
			mapping(6, 6, 6, 6, 0),
			mapping(26, 7, 24, 7, 0),
		]);

		expect(findOverlapCodeRange(0, 38, map, () => true)).toEqual({ start: 6, end: 33 });
	});
});
