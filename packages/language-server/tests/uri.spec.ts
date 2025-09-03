import { describe, expect, test } from 'vitest';
import { URI } from 'vscode-uri';
import { createUriConverter } from '../lib/project/typescriptProject';

describe('URI', () => {
	test('recoverable', () => {
		const uriConverter = createUriConverter([URI.parse('file:///')]);
		const cases = [
			'file:///a/b/c',
			'test://test/test.html',
			'file:///c:/a/b/c',
			'file:///C:/a/b/c',
			'untitled:Untitled-1',
			'vscode-notebook-cell:///a/b/c.one.ts',
			'vscode-notebook-cell:///a/b/c.one.ts#xdf4Gt6/a',
			'vscode-notebook-cell:///a/b/c.one.ts##a/%/v',
		];

		for (const uri of cases) {
			const a = uriConverter.asUri(uriConverter.asFileName(URI.parse(uri))).toString();
			const b = URI.parse(uri).toString();
			expect(a).toBe(b);
		}
	});

	test('HTTPs', () => {
		const uriConverter = createUriConverter([URI.parse('http://a')]);

		expect(uriConverter.asFileName(URI.parse('http://a/b'))).toBe('/b');
		expect(uriConverter.asFileName(URI.parse('https://a/b'))).toBe('/https%3A%2F%2Fa/b');
		expect(uriConverter.asFileName(URI.parse('https://a/b/##a/%/v'))).toBe('/https%3A%2F%2Fa/b//%23%23a%2F%25%2Fv');

		expect(uriConverter.asUri('/b').toString()).toBe('http://a/b');
		expect(uriConverter.asUri('/c').toString()).toBe('http://a/c');
		expect(uriConverter.asUri('/https%3A%2F%2Fa/d').toString()).toBe('https://a/d');
	});

	test('Empty Root Folders', () => {
		const uriConverter = createUriConverter([]);

		expect(uriConverter.asFileName(URI.parse('file:///a/b'))).toBe('/a/b');
		expect(uriConverter.asUri('/a/b').toString()).toBe('file:///a/b');
	});
});
