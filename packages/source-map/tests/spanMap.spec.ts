import { expect, test } from 'vitest';
import { mapping, SpanMapFeature, SpanMapKind } from '../lib/spanMap';

test('mapping is verbatim if its kind is omitted', () => {
	expect(mapping(30, 10, 10, 10, SpanMapFeature.Hover)).toEqual([30, 10, 10, 10, SpanMapKind.Verbatim, 1]);
});

test('mapping has the kind that is given', () => {
	expect(mapping(30, 12, 10, 4, 0, SpanMapKind.Atom)).toEqual([30, 12, 10, 4, SpanMapKind.Atom, 0]);
	expect(mapping(30, 12, 10, 4, 0, SpanMapKind.Alias)).toEqual([30, 12, 10, 4, SpanMapKind.Alias, 0]);
});
