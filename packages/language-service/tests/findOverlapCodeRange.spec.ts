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
				data: {},
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
				data: {},
			},
		];
		const map = new SourceMap(mappings);

		expect(findOverlapCodeRange(5, 32, map, () => true)).toEqual({ start: 6, end: 31 });
		expect(findOverlapCodeRange(7, 32, map, () => true)).toEqual({ start: 7, end: 31 });
		expect(findOverlapCodeRange(5, 30, map, () => true)).toEqual({ start: 6, end: 30 });
	});

	it('fallback to valid range (offset)', () => {
		const mappings: Mapping<CodeInformation>[] = [
			{
				sourceOffsets: [6],
				generatedOffsets: [7],
				lengths: [25],
				data: {},
			},
		];
		const map = new SourceMap(mappings);

		expect(findOverlapCodeRange(5, 32, map, () => true)).toEqual({ start: 7, end: 32 });
		expect(findOverlapCodeRange(7, 32, map, () => true)).toEqual({ start: 8, end: 32 });
		expect(findOverlapCodeRange(5, 30, map, () => true)).toEqual({ start: 7, end: 31 });
	});

	it('fallback to valid range (offset) - shorter generated range', () => {
		const mappings: Mapping<CodeInformation>[] = [
			{
				sourceOffsets: [6],
				generatedOffsets: [7],
				lengths: [25],
				generatedLengths: [23],
				data: {},
			},
		];
		const map = new SourceMap(mappings);

		expect(findOverlapCodeRange(5, 32, map, () => true)).toEqual({ start: 7, end: 30 });
		expect(findOverlapCodeRange(7, 32, map, () => true)).toEqual({ start: 8, end: 30 });
		expect(findOverlapCodeRange(5, 30, map, () => true)).toEqual({ start: 7, end: 30 });
		expect(findOverlapCodeRange(5, 26, map, () => true)).toEqual({ start: 7, end: 27 });
		expect(findOverlapCodeRange(6, 31, map, () => true)).toEqual({ start: 7, end: 30 });
	});

	it('mutilple mappings', () => {
		const mappings: Mapping<CodeInformation>[] = [
			{
				sourceOffsets: [6],
				generatedOffsets: [6],
				lengths: [6],
				data: {},
			},
			{
				sourceOffsets: [24],
				generatedOffsets: [26],
				lengths: [7],
				data: {},
			},
		];
		const map = new SourceMap(mappings);

		expect(findOverlapCodeRange(0, 38, map, () => true)).toEqual({ start: 6, end: 33 });
	});

	it('overlapping ranges', () => {
		const mappings: Mapping<CodeInformation>[] = [
			{
				sourceOffsets: [6],
				generatedOffsets: [10],
				lengths: [10],
				generatedLengths: [5],
				data: {},
			},
			{
				sourceOffsets: [7],
				generatedOffsets: [15],
				lengths: [1],
				generatedLengths: [3],
				data: {},
			},
			{
				sourceOffsets: [8],
				generatedOffsets: [20],
				lengths: [4],
				data: {},
			},
		];
		const map = new SourceMap(mappings);
		expect(findOverlapCodeRange(7, 8, map, () => true)).toEqual({ start: 15, end: 18 });
		expect(findOverlapCodeRange(6, 16, map, () => true)).toEqual({ start: 10, end: 15 });
		expect(findOverlapCodeRange(8, 10, map, () => true)).toEqual({ start: 20, end: 22 });

	})
});
