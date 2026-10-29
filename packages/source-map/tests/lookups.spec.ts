import { describe, expect, test } from 'vitest';
import { SpanMap, SpanMapFeature, SpanMapFidelity, SpanMapKind, type SpanMapSegment } from '../lib/spanMap';

const source = `{{data?.icon?.toString()}}`;
const generated =
	`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`;

function at(text: string, marked: string) {
	const offset = marked.indexOf('|');
	expect(marked.replace('|', '')).toBe(text);
	return offset;
}

function verbatim(originalStart: number, virtualStart: number, length: number, features = 0): SpanMapSegment {
	return {
		virtualStart,
		virtualEnd: virtualStart + length,
		originalStart,
		originalEnd: originalStart + length,
		kind: SpanMapKind.Verbatim,
		features,
	};
}

function atom(originalStart: number, originalEnd: number, virtualStart: number, virtualEnd: number): SpanMapSegment {
	return { virtualStart, virtualEnd, originalStart, originalEnd, kind: SpanMapKind.Atom, features: 0 };
}

function ranges(mapped: { start: number; end: number }[]) {
	return mapped.map(({ start, end }) => [start, end]);
}

describe('SpanMap', () => {
	test('Angular template', () => {
		const map = new SpanMap([
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

		expect(ranges(
			map.originalToVirtualSpans(
				at(source, `{{|data?.icon?.toString()}}`),
				at(source, `{{data|?.icon?.toString()}}`),
			).filter(mapped => mapped.fidelity !== SpanMapFidelity.Approximate),
		)).toEqual([
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

		expect(ranges(
			map.originalToVirtualSpans(
				at(source, `{{|data?.icon?.toString()}}`),
				at(source, `{{data?.icon|?.toString()}}`),
			).filter(mapped => mapped.fidelity !== SpanMapFidelity.Approximate),
		)).toEqual([
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

		expect(ranges(
			map.originalToVirtualSpans(
				at(source, `{{|data?.icon?.toString()}}`),
				at(source, `{{data?.icon?.toString()|}}`),
			).filter(mapped => mapped.fidelity !== SpanMapFidelity.Approximate),
		)).toEqual([
			[0, generated.length],
		]);
	});

	test('Angular template - approximate', () => {
		const map = new SpanMap([
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

		expect(ranges(
			map.originalToVirtualSpans(
				at(source, `{{|data?.icon?.toString()}}`),
				at(source, `{{data?.icon|?.toString()}}`),
			).filter(mapped => mapped.fidelity !== SpanMapFidelity.Approximate),
		)).toEqual([]);

		expect(ranges(map.originalToVirtualSpans(
			at(source, `{{|data?.icon?.toString()}}`),
			at(source, `{{data?.icon|?.toString()}}`),
		))).toEqual([
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
		const map = new SpanMap([
			{ virtualStart: 10, virtualEnd: 16, originalStart: 0, originalEnd: 7, kind: SpanMapKind.Atom },
		]);
		const positions = (mapped: { position: number }[]) => mapped.map(({ position }) => position);

		expect(positions(map.originalToVirtualPositions(0))).toEqual([10]);
		expect(positions(map.originalToVirtualPositions(3))).toEqual([10]);
		expect(positions(map.originalToVirtualPositions(7))).toEqual([16]);
		expect(positions(map.virtualToOriginalPositions(13))).toEqual([0]);
		expect(map.virtualToOriginalPositions(13)[0]!.fidelity).toBe(SpanMapFidelity.Atom);
		expect(ranges(map.virtualToOriginalSpans(11, 13))).toEqual([[0, 7]]);
		expect(ranges(map.originalToVirtualSpans(2, 2))).toEqual([[10, 16]]);
	});

	test('maps an alias as an atom', () => {
		const map = new SpanMap([
			{ virtualStart: 11, virtualEnd: 14, originalStart: 1, originalEnd: 10, kind: SpanMapKind.Alias },
		]);
		expect(map.originalToVirtualPositions(5).map(({ position }) => position)).toEqual([11]);
		expect(ranges(map.originalToVirtualSpans(5, 6))).toEqual([[11, 14]]);
	});

	test('maps a verbatim position exactly, clamped to the other span', () => {
		const map = new SpanMap([
			{ virtualStart: 11, virtualEnd: 20, originalStart: 1, originalEnd: 10, kind: SpanMapKind.Verbatim },
			{ virtualStart: 30, virtualEnd: 32, originalStart: 20, originalEnd: 25, kind: SpanMapKind.Verbatim },
		]);
		expect(map.originalToVirtualPositions(5)).toMatchObject([{ position: 15, fidelity: SpanMapFidelity.Exact }]);
		expect(map.originalToVirtualPositions(1).map(({ position }) => position)).toEqual([11]);
		expect(map.originalToVirtualPositions(10).map(({ position }) => position)).toEqual([20]);
		expect(map.originalToVirtualPositions(24).map(({ position }) => position)).toEqual([32]);
	});

	test('maps a gap to nothing', () => {
		const map = new SpanMap([
			{ virtualStart: 0, virtualEnd: 3, originalStart: 0, originalEnd: 3, kind: SpanMapKind.Verbatim },
			{ virtualStart: 10, virtualEnd: 13, originalStart: 5, originalEnd: 8, kind: SpanMapKind.Verbatim },
		]);
		expect(map.virtualToOriginalPositions(5)).toEqual([]);
		expect(map.originalToVirtualPositions(4)).toEqual([]);
		expect(new SpanMap([]).originalToVirtualPositions(0)).toEqual([]);
	});

	test('filters by features', () => {
		const map = new SpanMap([
			verbatim(0, 0, 5, SpanMapFeature.Hover),
			verbatim(0, 10, 5, SpanMapFeature.Rename),
			{ virtualStart: 20, virtualEnd: 25, originalStart: 0, originalEnd: 5, kind: SpanMapKind.Verbatim },
		]);

		expect(map.originalToVirtualPositions(2, SpanMapFeature.Rename).map(({ position }) => position))
			.toEqual([12, 22]);
		expect(map.originalToVirtualPositions(2).map(({ position }) => position)).toEqual([2, 12, 22]);
		expect(map.segments[2]!.features).toBe(SpanMapFeature.All);
	});
});
