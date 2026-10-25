import type { IScriptSnapshot, LanguagePlugin, VirtualCode } from '@volar/language-core';
import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { createLanguage, createLanguageService, createUriMap, type LanguageServicePlugin } from '../index';

function snapshotOf(text: string): IScriptSnapshot {
	return {
		getText: (start, end) => text.slice(start, end),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
}

function setText(code: VirtualCode, snapshot: IScriptSnapshot) {
	const mappings = [{
		sourceOffsets: [0],
		generatedOffsets: [0],
		lengths: [snapshot.getLength()],
		data: { format: true },
	}];
	code.snapshot = snapshot;
	code.mappings = mappings;
	code.embeddedCodes = [{ id: 'inner', languageId: 'inner', snapshot, mappings }];
}

describe(`Test provideDocumentFormattingEdits()`, () => {
	it(`formats embedded code with a plugin that only accepts the document's own file name`, async () => {
		const uri = URI.parse('file:///a.vfile');
		const text = 'let  a   =  1;';

		// Like a host that hands the plugin only the files with its extensions, and a plugin that caches its
		// virtual codes by script ID and updates them in place.
		const virtualCodes = new Map<string, VirtualCode>();
		const languagePlugin: LanguagePlugin<URI> = {
			getLanguageId: id => id.path.endsWith('.vfile') ? 'vfile' : undefined,
			createVirtualCode(id, _languageId, snapshot) {
				if (!id.path.endsWith('.vfile')) {
					return;
				}
				let code = virtualCodes.get(id.toString());
				if (!code) {
					code = { id: 'root', languageId: 'vfile', snapshot, mappings: [] };
					virtualCodes.set(id.toString(), code);
				}
				setText(code, snapshot);
				return code;
			},
			disposeVirtualCode(id) {
				virtualCodes.delete(id.toString());
			},
		};
		const servicePlugin: LanguageServicePlugin = {
			capabilities: { documentFormattingProvider: true },
			create() {
				return {
					provideDocumentFormattingEdits(document) {
						if (document.languageId !== 'inner') {
							return;
						}
						return [{
							range: { start: document.positionAt(0), end: document.positionAt(document.getText().length) },
							newText: document.getText().replace(/ +/g, ' '),
						}];
					},
				};
			},
		};

		const language = createLanguage<URI>([languagePlugin], createUriMap(), () => {});
		const service = createLanguageService(language, [servicePlugin], { workspaceFolders: [] }, {});
		const sourceScript = language.scripts.set(uri, snapshotOf(text), 'vfile')!;
		const root = sourceScript.generated!.root;

		const edits = await service.getDocumentFormattingEdits(
			uri,
			{ tabSize: 4, insertSpaces: true },
			undefined,
			undefined,
		);

		expect(TextDocument.applyEdits(TextDocument.create(uri.toString(), 'vfile', 0, text), edits ?? []))
			.toBe('let a = 1;');
		// the document's own virtual code is left as it was
		expect(sourceScript.generated!.root).toBe(root);
		expect(root.snapshot.getText(0, root.snapshot.getLength())).toBe(text);
		expect([...virtualCodes.keys()]).toEqual([uri.toString()]);
	});
});
