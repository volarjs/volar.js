import { describe, expect, test } from 'vitest';
import { SourceMap } from '../lib/sourceMap';
import { type Mapping, SpanMapFeature, SpanMapKind } from '../lib/spanMap';

const source = `{{data?.icon?.toString()}}`;
const generated =
	`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`;

function at(text: string, marked: string) {
	const offset = marked.indexOf('|');
	expect(marked.replace('|', '')).toBe(text);
	return offset;
}

function verbatim(sourceStart: number, generatedStart: number, length: number, features = 0): Mapping {
	return [generatedStart, length, sourceStart, length, SpanMapKind.Verbatim, features];
}

function atom(sourceStart: number, sourceEnd: number, generatedStart: number, generatedEnd: number): Mapping {
	return [generatedStart, generatedEnd - generatedStart, sourceStart, sourceEnd - sourceStart, SpanMapKind.Atom, 0];
}

describe('sourceMap', () => {
	test('Angular template', () => {
		const map = new SourceMap([
			verbatim(
				at(source, `{{|data?.icon?.toString()}}`),
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.|data)!.icon : undefined)!.toString : undefined))!() : undefined)`,
				),
				`data`.length,
			),
			verbatim(
				at(source, `{{data?.|icon?.toString()}}`),
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.|icon : undefined)!.toString : undefined))!() : undefined)`,
				),
				`icon`.length,
			),
			verbatim(
				at(source, `{{data?.icon?.|toString()}}`),
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)!.|toString : undefined))!() : undefined)`,
				),
				`toString`.length,
			),
			verbatim(
				at(source, `{{data?.icon?.toString|()}}`),
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))!|() : undefined)`,
				),
				`()`.length,
			),
			atom(
				at(source, `{{|data?.icon?.toString()}}`),
				at(source, `{{data?.icon|?.toString()}}`),
				at(
					generated,
					`(null as any ? ((null as any ? (|(null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`,
				),
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)|!.toString : undefined))!() : undefined)`,
				),
			),
			atom(
				at(source, `{{|data?.icon?.toString()}}`),
				at(source, `{{data?.icon?.toString|()}}`),
				at(
					generated,
					`(null as any ? (|(null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`,
				),
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))|!() : undefined)`,
				),
			),
			atom(
				at(source, `{{|data?.icon?.toString()}}`),
				at(source, `{{data?.icon?.toString()|}}`),
				0,
				generated.length,
			),
		]);

		expect([...map.toGeneratedRange(
			at(source, `{{|data?.icon?.toString()}}`),
			at(source, `{{data|?.icon?.toString()}}`),
			false,
		)].map(mapped => mapped.slice(0, 2))).toEqual([
			[
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.|data)!.icon : undefined)!.toString : undefined))!() : undefined)`,
				),
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.data|)!.icon : undefined)!.toString : undefined))!() : undefined)`,
				),
			],
			[
				at(
					generated,
					`(null as any ? ((null as any ? (|(null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`,
				),
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)|!.toString : undefined))!() : undefined)`,
				),
			],
			[
				at(
					generated,
					`(null as any ? (|(null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`,
				),
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))|!() : undefined)`,
				),
			],
			[0, generated.length],
		]);

		expect([...map.toGeneratedRange(
			at(source, `{{|data?.icon?.toString()}}`),
			at(source, `{{data?.icon|?.toString()}}`),
			false,
		)].map(mapped => mapped.slice(0, 2))).toEqual([
			[
				at(
					generated,
					`(null as any ? ((null as any ? (|(null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`,
				),
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)|!.toString : undefined))!() : undefined)`,
				),
			],
			[
				at(
					generated,
					`(null as any ? (|(null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`,
				),
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))|!() : undefined)`,
				),
			],
			[0, generated.length],
		]);

		expect([...map.toGeneratedRange(
			at(source, `{{|data?.icon?.toString()}}`),
			at(source, `{{data?.icon?.toString()|}}`),
			false,
		)].map(mapped => mapped.slice(0, 2))).toEqual([
			[0, generated.length],
		]);
	});

	test('Angular template - fallbackToAnyMatch', () => {
		const map = new SourceMap([
			verbatim(
				at(source, `{{|data?.icon?.toString()}}`),
				at(
					generated,
					`(null as any ? ((null as any ? (|(null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`,
				),
				0,
			),
			verbatim(
				at(source, `{{data?.icon|?.toString()}}`),
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)|!.toString : undefined))!() : undefined)`,
				),
				0,
			),
		]);

		expect([...map.toGeneratedRange(
			at(source, `{{|data?.icon?.toString()}}`),
			at(source, `{{data?.icon|?.toString()}}`),
			false,
		)].map(mapped => mapped.slice(0, 2))).toEqual([]);

		expect([...map.toGeneratedRange(
			at(source, `{{|data?.icon?.toString()}}`),
			at(source, `{{data?.icon|?.toString()}}`),
			true,
		)].map(mapped => mapped.slice(0, 2))).toEqual([
			[
				at(
					generated,
					`(null as any ? ((null as any ? (|(null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`,
				),
				at(
					generated,
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)|!.toString : undefined))!() : undefined)`,
				),
			],
		]);
	});

	test('atom points clamp to the edges', () => {
		const map = new SourceMap([[10, 6, 0, 7, SpanMapKind.Atom, SpanMapFeature.Hover]]);

		expect([...map.toGeneratedLocation(0)].map(mapped => mapped[0])).toEqual([10]);
		expect([...map.toGeneratedLocation(3)].map(mapped => mapped[0])).toEqual([10]);
		expect([...map.toGeneratedLocation(7)].map(mapped => mapped[0])).toEqual([16]);
		expect([...map.toSourceLocation(13)].map(mapped => mapped[0])).toEqual([0]);
		expect([...map.toSourceRange(11, 13, false)].map(mapped => mapped.slice(0, 2))).toEqual([[0, 7]]);
		expect([...map.toGeneratedRange(2, 2, false)].map(mapped => mapped.slice(0, 2))).toEqual([[10, 16]]);
	});

	test('filters by features', () => {
		const map = new SourceMap([
			verbatim(0, 0, 5, SpanMapFeature.Hover),
			verbatim(0, 10, 5, SpanMapFeature.Rename),
		]);

		expect([...map.toGeneratedLocation(2, features => !!(features & SpanMapFeature.Rename))].map(mapped => mapped[0]))
			.toEqual([12]);
		expect([...map.toGeneratedLocation(2)].map(mapped => mapped[0])).toEqual([2, 12]);
	});
});
