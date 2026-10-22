import { describe, expect, it } from 'vitest';
import { createLanguage, type IScriptSnapshot, type LanguagePlugin, type VirtualCode } from '../index';

function createSnapshot(text: string): IScriptSnapshot {
	return {
		getText: (start, end) => text.slice(start, end),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
}

function createPlugin<T>(name: string, extensions?: string[]): LanguagePlugin<T> & { calls: T[] } {
	const calls: T[] = [];
	return {
		calls,
		extensions,
		getLanguageId: () => name,
		isAssociatedFileOnly(id) {
			calls.push(id);
			return false;
		},
		createVirtualCode(_id, _languageId, snapshot): VirtualCode {
			return { id: name, languageId: name, snapshot, mappings: [] };
		},
	};
}

function getGenerated<T>(plugins: LanguagePlugin<T>[], id: T, languageId?: string) {
	const language = createLanguage(plugins, new Map(), () => {});
	const sourceScript = language.scripts.set(id, createSnapshot(''), languageId);
	return {
		languageId: sourceScript?.languageId,
		plugin: sourceScript?.generated?.root.id,
	};
}

describe('LanguagePlugin.extensions', () => {
	it('offers every script to plugins without extensions', () => {
		const plugins = [createPlugin<string>('a'), createPlugin<string>('b')];

		expect(getGenerated(plugins, '/src/foo.vue')).toEqual({ languageId: 'a', plugin: 'a' });
		expect(getGenerated(plugins, '/src/foo.ts')).toEqual({ languageId: 'a', plugin: 'a' });
	});

	it('routes a script by its longest matched extension', () => {
		const plugins = [
			createPlugin<string>('md', ['.md']),
			createPlugin<string>('vitepress', ['.vue.md']),
			createPlugin<string>('sfc', ['.vue']),
		];

		expect(getGenerated(plugins, '/src/foo.vue.md')).toEqual({ languageId: 'vitepress', plugin: 'vitepress' });
		expect(getGenerated(plugins, '/src/foo.md')).toEqual({ languageId: 'md', plugin: 'md' });
		expect(getGenerated(plugins, '/src/foo.vue')).toEqual({ languageId: 'sfc', plugin: 'sfc' });
		expect(getGenerated(plugins, '/src/foo.ts')).toEqual({ languageId: undefined, plugin: undefined });
		expect(getGenerated(plugins, '/src/foo.notvue')).toEqual({ languageId: undefined, plugin: undefined });
	});

	it('matches extensions case-sensitively', () => {
		expect(getGenerated([createPlugin<string>('sfc', ['.vue'])], '/src/foo.VUE')).toEqual({
			languageId: undefined,
			plugin: undefined,
		});
	});

	it('keeps plugins without extensions alongside routed plugins', () => {
		const host: LanguagePlugin<string> = { getLanguageId: id => id.endsWith('.ts') ? 'typescript' : undefined };
		const plugins = [host, createPlugin<string>('sfc', ['.vue']), createPlugin<string>('vitepress', ['.vue.md'])];

		expect(getGenerated(plugins, '/src/foo.vue.md', 'markdown')).toEqual({
			languageId: 'markdown',
			plugin: 'vitepress',
		});
		expect(getGenerated(plugins, '/src/foo.ts')).toEqual({ languageId: 'typescript', plugin: undefined });
	});

	it('tries plugins sharing the longest extension in order', () => {
		const declined: LanguagePlugin<string> = {
			extensions: ['.vue'],
			getLanguageId: () => undefined,
			createVirtualCode: () => undefined,
		};
		const plugins = [declined, createPlugin<string>('md', ['.md', '.vue']), createPlugin<string>('sfc', ['.vue'])];

		expect(getGenerated(plugins, '/src/foo.vue')).toEqual({ languageId: 'md', plugin: 'md' });
	});

	it('asks only routed plugins whether a script is associated only', () => {
		const sfc = createPlugin<string>('sfc', ['.vue']);
		const vitepress = createPlugin<string>('vitepress', ['.vue.md']);

		getGenerated([sfc, vitepress], '/src/foo.vue.md');

		expect(sfc.calls).toEqual([]);
		expect(vitepress.calls).toEqual(['/src/foo.vue.md']);
	});

	it('matches Windows paths and URI ids', () => {
		class Uri {
			constructor(private readonly value: string) {}
			toString() {
				return this.value;
			}
		}
		const sfc = createPlugin<string | Uri>('sfc', ['.vue']);

		expect(getGenerated([sfc], 'C:\\src\\foo.vue')).toEqual({ languageId: 'sfc', plugin: 'sfc' });
		expect(getGenerated([sfc], new Uri('file:///c%3A/src/foo.vue'))).toEqual({ languageId: 'sfc', plugin: 'sfc' });
		expect(getGenerated([sfc], new Uri('file:///c%3A/src/foo.ts'))).toEqual({
			languageId: undefined,
			plugin: undefined,
		});
	});
});
