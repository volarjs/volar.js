import { createLanguage } from '@volar/language-core';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createProxyLanguageService } from '../lib/node/proxyLanguageService';

describe('proxy language service', () => {
	it('uses an assigned method after caching its proxy', () => {
		const original = () => [];
		let replacementCalled = false;
		const replacement = () => {
			replacementCalled = true;
			return [];
		};
		const languageService = {
			getFileReferences: original,
		} as unknown as ts.LanguageService;
		const { proxy, initialize } = createProxyLanguageService(languageService);
		initialize(createLanguage<string>([], new Map(), () => {}));

		proxy.getFileReferences('/a.ts');
		proxy.getFileReferences = replacement as ts.LanguageService['getFileReferences'];

		proxy.getFileReferences('/a.ts');
		expect(replacementCalled).toBe(true);
	});
});
