import type * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { register } from '../lib/features/provideCompletionItems';
import type { LanguageServiceContext, LanguageServicePlugin, LanguageServicePluginInstance } from '../lib/types';

function snapshotOf(text: string): ts.IScriptSnapshot {
	return {
		getText: (start, end) => text.slice(start, end),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
}

// The smallest context the completion feature needs: one plain source
// document with no embedded codes, and whatever plugins the test passes in.
function createContext(plugins: LanguageServicePluginInstance[]): LanguageServiceContext {
	const snapshot = snapshotOf('const a = 1;');
	const plugin: LanguageServicePlugin = { capabilities: { completionProvider: {} }, create: () => ({}) };
	return {
		language: {
			scripts: {
				get: () => ({ id: URI.parse('file:///a.ts'), languageId: 'typescript', snapshot, generated: undefined }),
			},
		},
		documents: {
			get: (uri: URI, languageId: string, snap: ts.IScriptSnapshot) =>
				TextDocument.create(uri.toString(), languageId, 1, snap.getText(0, snap.getLength())),
		},
		plugins: plugins.map(instance => [plugin, instance] as [LanguageServicePlugin, LanguageServicePluginInstance]),
		disabledServicePlugins: new WeakSet(),
		decodeEmbeddedDocumentUri: () => undefined,
		encodeEmbeddedDocumentUri: (uri: URI) => uri,
	} as unknown as LanguageServiceContext;
}

function listOf(...labels: string[]): vscode.CompletionList {
	return { isIncomplete: false, items: labels.map(label => ({ label })) };
}

describe(`provideCompletionItems`, () => {
	const uri = URI.parse('file:///a.ts');
	const position = { line: 0, character: 5 };

	it(`keeps the results of overlapping requests apart`, async () => {
		let call = 0;
		let releaseFirst!: () => void;
		const firstDone = new Promise<void>(resolve => {
			releaseFirst = resolve;
		});
		const getCompletionItems = register(createContext([{
			async provideCompletionItems() {
				call++;
				if (call === 1) {
					// The first request is still waiting on its plugin when the
					// second request starts and finishes.
					await firstDone;
					return listOf('first');
				}
				return listOf('second');
			},
		}]));

		const first = getCompletionItems(uri, position);
		const second = await getCompletionItems(uri, position);
		releaseFirst();
		const firstList = await first;

		expect(second.items.map(item => item.label)).toEqual(['second']);
		expect(firstList.items.map(item => item.label)).toEqual(['first']);
	});

	it(`still reuses the previous result for incomplete completions`, async () => {
		const calls: number[] = [];
		const getCompletionItems = register(createContext([{
			async provideCompletionItems(_document, _position, context) {
				calls.push(context.triggerKind);
				return { isIncomplete: true, items: [{ label: `kind-${context.triggerKind}` }] };
			},
		}]));

		const invoked = await getCompletionItems(uri, position, { triggerKind: 1 });
		const retriggered = await getCompletionItems(uri, position, { triggerKind: 3 });

		expect(invoked.items.map(item => item.label)).toEqual(['kind-1']);
		expect(retriggered.items.map(item => item.label)).toEqual(['kind-3']);
		expect(calls).toEqual([1, 3]);
	});
});
