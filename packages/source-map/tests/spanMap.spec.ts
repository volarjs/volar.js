import { expect, test } from 'vitest';
import { SpanMapFeature, SpanMapFidelity, SpanMapKind } from '../lib/spanMap';

// volar.js installs TS 7.1 as `typescript-7`; language-tools, which has this package as a submodule, as `typescript`
const tsPackage = ['typescript-7', 'typescript'].find(name => {
	try {
		return require(`${name}/package.json`).version.startsWith('7.');
	}
	catch {
		return false;
	}
});

test('the span map enums have the members and values of TS 7.1', () => {
	expect(tsPackage).toBeDefined();
	const ts = require(`${tsPackage}/ast`);
	for (
		const [name, ours] of [['SpanMapKind', SpanMapKind], ['SpanMapFeature', SpanMapFeature], [
			'SpanMapFidelity',
			SpanMapFidelity,
		]] as const
	) {
		expect({ name, members: { ...ours } }).toEqual({ name, members: { ...ts[name] } });
	}
});
