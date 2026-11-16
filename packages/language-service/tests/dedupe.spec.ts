import { describe, expect, it } from 'vitest';
import { withCodeAction } from '../lib/utils/dedupe';

describe('withCodeAction', () => {
	it('keeps same-title actions with different data', () => {
		const actions = [
			{ title: 'Organize imports', data: { region: 'frontmatter' } },
			{ title: 'Organize imports', data: { region: 'script' } },
		];

		expect(withCodeAction(actions)).toEqual(actions);
	});

	it('deduplicates same-title actions with equivalent data', () => {
		const actions = [
			{ title: 'Organize imports', data: { region: 'frontmatter' } },
			{ title: 'Organize imports', data: { region: 'frontmatter' } },
		];

		expect(withCodeAction(actions)).toEqual([actions[1]]);
	});
});
