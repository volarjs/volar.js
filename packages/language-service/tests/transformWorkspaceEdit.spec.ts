import {
	type IScriptSnapshot,
	type LanguagePlugin,
	type Mapping,
	mapping,
	type VirtualCode,
} from '@volar/language-core';
import { describe, expect, it } from 'vitest';
import type * as vscode from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { createLanguage, createLanguageService, createUriMap } from '../index';
import { transformWorkspaceEdit } from '../lib/utils/transform';

const features = (1 << 20) - 1;

function snapshotOf(text: string): IScriptSnapshot {
	return {
		getText: (start, end) => text.slice(start, end),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
}

// The embedded code appends a line that has no source mapping.
function createVirtualCode(text: string): VirtualCode {
	const mappings: Mapping[] = [mapping(0, text.length, 0, text.length, features)];
	return {
		id: 'root',
		languageId: 'test',
		snapshot: snapshotOf(text),
		mappings,
		embeddedCodes: [{
			id: 'inner',
			languageId: 'inner',
			snapshot: snapshotOf(text + '\ngenerated'),
			mappings,
		}],
	};
}

const uri = URI.parse('file:///a.test');
const languagePlugin: LanguagePlugin<URI> = {
	getLanguageId: () => 'test',
	createVirtualCode: (_id, _languageId, snapshot) => createVirtualCode(snapshot.getText(0, snapshot.getLength())),
};
const language = createLanguage<URI>([languagePlugin], createUriMap(), () => {});
language.scripts.set(uri, snapshotOf('source'), 'test');
const { context } = createLanguageService(language, [], { workspaceFolders: [] }, {});
const embeddedUri = context.encodeEmbeddedDocumentUri(uri, 'inner').toString();

const mappedEdit: vscode.TextEdit = {
	range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
	newText: 'mapped',
};
const unmappedEdit: vscode.TextEdit = {
	range: { start: { line: 1, character: 0 }, end: { line: 1, character: 9 } },
	newText: 'unmapped',
};

describe('transformWorkspaceEdit', () => {
	it('keeps a code action whose edits all map to the source', () => {
		const edit = transformWorkspaceEdit({ changes: { [embeddedUri]: [mappedEdit] } }, context, 'codeAction');
		expect(edit?.changes?.[uri.toString()]).toEqual([mappedEdit]);
	});

	it('drops a code action when any edit in changes does not map', () => {
		const edit = transformWorkspaceEdit(
			{ changes: { [embeddedUri]: [mappedEdit, unmappedEdit] } },
			context,
			'codeAction',
		);
		expect(edit).toBeUndefined();
	});

	it('drops a code action when any edit in documentChanges does not map', () => {
		const edit = transformWorkspaceEdit(
			{
				documentChanges: [{
					textDocument: { uri: embeddedUri, version: null },
					edits: [mappedEdit, unmappedEdit],
				}],
			},
			context,
			'codeAction',
		);
		expect(edit).toBeUndefined();
	});

	it('keeps the mapped edits of a rename', () => {
		for (const mode of ['rename', 'fileName'] as const) {
			const edit = transformWorkspaceEdit({ changes: { [embeddedUri]: [mappedEdit, unmappedEdit] } }, context, mode);
			expect(edit?.changes?.[uri.toString()]).toEqual([mappedEdit]);
		}
	});
});
