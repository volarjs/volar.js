import { describe, expect, it } from 'vitest';
import { defaultMapperFactory, findOverlapCodeRange, SpanMapFeature, SpanMapKind } from '../index';

function segment(
	virtualStart: number,
	virtualLength: number,
	originalStart: number,
	originalLength: number,
	kind: SpanMapKind,
) {
	return {
		virtualStart,
		virtualEnd: virtualStart + virtualLength,
		originalStart,
		originalEnd: originalStart + originalLength,
		kind,
	};
}

// test code: <html><body><p>Hello</p></body></html>

describe(`Test findOverlapCodeRange()`, () => {
	it('signal mapping', () => {
		const map = defaultMapperFactory([segment(0, 38, 0, 38, SpanMapKind.Verbatim)]);

		expect(findOverlapCodeRange(0, 38, map, SpanMapFeature.All)).toEqual({ start: 0, end: 38 });
		expect(findOverlapCodeRange(6, 31, map, SpanMapFeature.All)).toEqual({ start: 6, end: 31 });
	});

	it('fallback to valid range', () => {
		const map = defaultMapperFactory([segment(6, 25, 6, 25, SpanMapKind.Verbatim)]);

		expect(findOverlapCodeRange(5, 32, map, SpanMapFeature.All)).toEqual({ start: 6, end: 31 });
		expect(findOverlapCodeRange(7, 32, map, SpanMapFeature.All)).toEqual({ start: 7, end: 31 });
		expect(findOverlapCodeRange(5, 30, map, SpanMapFeature.All)).toEqual({ start: 6, end: 30 });
	});

	it('fallback to valid range (offset)', () => {
		const map = defaultMapperFactory([segment(7, 25, 6, 25, SpanMapKind.Verbatim)]);

		expect(findOverlapCodeRange(5, 32, map, SpanMapFeature.All)).toEqual({ start: 7, end: 32 });
		expect(findOverlapCodeRange(7, 32, map, SpanMapFeature.All)).toEqual({ start: 8, end: 32 });
		expect(findOverlapCodeRange(5, 30, map, SpanMapFeature.All)).toEqual({ start: 7, end: 31 });
	});

	it('fallback to the whole atom', () => {
		const map = defaultMapperFactory([segment(7, 23, 6, 25, SpanMapKind.Atom)]);

		expect(findOverlapCodeRange(5, 32, map, SpanMapFeature.All)).toEqual({ start: 7, end: 30 });
		expect(findOverlapCodeRange(7, 32, map, SpanMapFeature.All)).toEqual({ start: 7, end: 30 });
		expect(findOverlapCodeRange(5, 26, map, SpanMapFeature.All)).toEqual({ start: 7, end: 30 });
		expect(findOverlapCodeRange(6, 31, map, SpanMapFeature.All)).toEqual({ start: 7, end: 30 });
	});

	it('mutilple mappings', () => {
		const map = defaultMapperFactory([
			segment(6, 6, 6, 6, SpanMapKind.Verbatim),
			segment(26, 7, 24, 7, SpanMapKind.Verbatim),
		]);

		expect(findOverlapCodeRange(0, 38, map, SpanMapFeature.All)).toEqual({ start: 6, end: 33 });
	});
});
