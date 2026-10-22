import { createLanguage, type LanguagePlugin } from '@volar/language-core';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createProxyLanguageService } from '../lib/node/proxyLanguageService';

const fileName = '/a.foo';
const sourceText = 'const a = 1;';
// The service script appends a line that has no source mapping.
const serviceText = sourceText + '\nconst b = 2;';

const languagePlugin: LanguagePlugin<string> = {
	getLanguageId: id => id.endsWith('.foo') ? 'foo' : undefined,
	createVirtualCode: (_id, languageId) =>
		languageId === 'foo'
			? {
				id: 'main',
				languageId: 'typescript',
				snapshot: ts.ScriptSnapshot.fromString(serviceText),
				mappings: [{
					sourceOffsets: [0],
					generatedOffsets: [0],
					lengths: [sourceText.length],
					data: { verification: true, navigation: true },
				}],
			}
			: undefined,
	typescript: {
		extraFileExtensions: [],
		getServiceScript: root => ({
			code: root,
			extension: '.ts',
			scriptKind: ts.ScriptKind.TS,
			preventLeadingOffset: true,
		}),
	},
};

const mappedChange: ts.TextChange = { span: { start: 0, length: 5 }, newText: 'let' };
const unmappedChange: ts.TextChange = { span: { start: sourceText.length + 1, length: 5 }, newText: 'let' };

function createService(textChanges: ts.TextChange[]) {
	const language = createLanguage<string>([languagePlugin], new Map(), () => {});
	language.scripts.set(fileName, ts.ScriptSnapshot.fromString(sourceText));
	const changes = (): ts.FileTextChanges[] => [{ fileName, textChanges: textChanges.map(c => ({ ...c })) }];
	const languageService = {
		organizeImports: () => changes(),
		getEditsForRefactor: () => ({ edits: changes() }),
		getCombinedCodeFix: () => ({ changes: changes() }),
		getCodeFixesAtPosition: () => [{ fixName: 'fix', description: 'fix', changes: changes() }],
		getEditsForFileRename: () => changes(),
	} as Partial<ts.LanguageService> as ts.LanguageService;
	const { proxy, initialize } = createProxyLanguageService(languageService);
	initialize(language);
	return proxy;
}

function codeActionChanges(service: ts.LanguageService) {
	return {
		organizeImports: service.organizeImports({ type: 'file', fileName }, {}, undefined),
		refactor: service.getEditsForRefactor(fileName, {}, { pos: 0, end: 1 }, 'refactor', 'action', {})?.edits,
		combinedCodeFix: service.getCombinedCodeFix({ type: 'file', fileName }, 'fix', {}, {}).changes,
		codeFixes: service.getCodeFixesAtPosition(fileName, 0, 1, [], {}, {}).map(fix => fix.changes),
	};
}

describe('code action edits', () => {
	it('keeps code actions whose changes all map to the source', () => {
		const expected = [{ fileName, isNewFile: false, textChanges: [mappedChange] }];
		expect(codeActionChanges(createService([mappedChange]))).toEqual({
			organizeImports: expected,
			refactor: expected,
			combinedCodeFix: expected,
			codeFixes: [expected],
		});
	});

	it('drops code actions with any change that does not map', () => {
		expect(codeActionChanges(createService([mappedChange, unmappedChange]))).toEqual({
			organizeImports: [],
			refactor: undefined,
			combinedCodeFix: [],
			codeFixes: [],
		});
	});

	it('keeps the mapped changes of a file rename', () => {
		const service = createService([mappedChange, unmappedChange]);
		expect(service.getEditsForFileRename('/old.ts', '/new.ts', {}, undefined)).toEqual([
			{ fileName, isNewFile: false, textChanges: [mappedChange] },
		]);
	});
});
