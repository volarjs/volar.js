import { describe, expect, test } from 'vitest';
import { URI } from 'vscode-uri';
import { createUriConverter } from '../lib/uri';

describe('URI', () => {

	test('recoverable', () => {

		const uriConverter = createUriConverter();
		const cases = [
			'file:///a/b/c',
			'test://test/test.html',
			'file:///c:/a/b/c',
			'file:///C:/a/b/c',
			'untitled:Untitled-1',
		];

		for (const uri of cases) {
			expect(uriConverter.fileNameToUri(uriConverter.uriToFileName(uri))).toBe(URI.parse(uri).toString());
		}
	});
});
