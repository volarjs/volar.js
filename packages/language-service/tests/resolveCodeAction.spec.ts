import {
	type IScriptSnapshot,
	type LanguagePlugin,
	SpanMapKind,
	type SpanMapSegment,
	type VirtualCode,
} from '@volar/language-core';
import { describe, expect, it } from 'vitest';
import { URI } from 'vscode-uri';
import { createLanguage, createLanguageService, createUriMap, type LanguageServicePlugin } from '../index';

const features = (1 << 20) - 1;

function snapshotOf(text: string): IScriptSnapshot {
	return {
		getText: (start, end) => text.slice(start, end),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
}

function createVirtualCode(text: string): VirtualCode {
	const snapshot = snapshotOf(text);
	const mappings: SpanMapSegment[] = [
		{
			virtualStart: 0,
			virtualEnd: text.length,
			originalStart: 0,
			originalEnd: text.length,
			kind: SpanMapKind.Verbatim,
			features,
		},
	];
	return {
		id: 'root',
		languageId: 'test',
		snapshot,
		mappings,
		embeddedCodes: [{
			id: 'inner',
			languageId: 'inner',
			snapshot,
			mappings,
		}],
	};
}

describe(`Test resolveCodeAction()`, () => {
	it(`does not report Volar's internal document counter as the edit's document version`, async () => {
		const uri = URI.parse('file:///a.test');

		const languagePlugin: LanguagePlugin<URI> = {
			getLanguageId: () => 'test',
			createVirtualCode: (_id, _languageId, snapshot) => createVirtualCode(snapshot.getText(0, snapshot.getLength())),
		};
		const servicePlugin: LanguageServicePlugin = {
			capabilities: { codeActionProvider: { resolveProvider: true } },
			create(context) {
				return {
					provideCodeActions(document) {
						return [{ title: 'Add import', kind: 'quickfix', data: { uri: document.uri } }];
					},
					resolveCodeAction(codeAction) {
						return {
							...codeAction,
							edit: {
								documentChanges: [{
									textDocument: {
										uri: context.encodeEmbeddedDocumentUri(uri, 'inner').toString(),
										version: null,
									},
									edits: [{
										range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
										newText: 'import x;\n',
									}],
								}],
							},
						};
					},
				};
			},
		};

		const language = createLanguage<URI>([languagePlugin], createUriMap(), () => {});
		const service = createLanguageService(language, [servicePlugin], { workspaceFolders: [] }, {});

		// Every edit to the file makes Volar hand out a fresh internal document, whose
		// version counts up from 0 and has nothing to do with the version the client
		// sent in didOpen/didChange.
		let text = 'a';
		for (let i = 0; i < 3; i++) {
			text += 'a';
			language.scripts.set(uri, snapshotOf(text), 'test');
			await service.getCodeActions(uri, {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 1 },
			}, { diagnostics: [] });
		}

		const actions = await service.getCodeActions(uri, {
			start: { line: 0, character: 0 },
			end: { line: 0, character: 1 },
		}, { diagnostics: [] });
		expect(actions).toHaveLength(1);

		const resolved = await service.resolveCodeAction(actions![0]);
		const change = resolved.edit!.documentChanges![0] as { textDocument: { uri: string; version: number | null } };

		expect(change.textDocument.uri).toBe(uri.toString());
		// LSP allows a null version when the server does not know the client's. A
		// number here is compared against the client's own counter, and a client that
		// checks it (Neovim does) rejects the edit as stale.
		expect(change.textDocument.version).toBeNull();
	});
});
