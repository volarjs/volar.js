import { describe, expect, it } from 'vitest';
import { findOverlapCodeRange } from '../lib/utils/common';
import { CodeInformation, Mapping, SourceMap } from '@volar/language-core';

// test code: <html><body><p>Hello</p></body></html>

describe(`Test findOverlapCodeRange()`, () => {

	it('signal mapping', () => {
		const mappings: Mapping<CodeInformation>[] = [
			{
				sourceOffsets: [0],
				generatedOffsets: [0],
				lengths: [38],
				data: { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: true },
			},
		];
		const map = new SourceMap(mappings);

		expect(findOverlapCodeRange(0, 38, map, () => true)).toEqual({ start: 0, end: 38 });
		expect(findOverlapCodeRange(6, 31, map, () => true)).toEqual({ start: 6, end: 31 });
	});

	it('fallback to valid range', () => {
		const mappings: Mapping<CodeInformation>[] = [
			{
				sourceOffsets: [6],
				generatedOffsets: [6],
				lengths: [25],
				data: { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: true },
			},
		];
		const map = new SourceMap(mappings);

		expect(findOverlapCodeRange(5, 32, map, () => true)).toEqual({ start: 6, end: 31 });
		expect(findOverlapCodeRange(7, 32, map, () => true)).toEqual({ start: 7, end: 31 });
		expect(findOverlapCodeRange(5, 30, map, () => true)).toEqual({ start: 6, end: 30 });
	});
});
