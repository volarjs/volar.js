import { describe, expect, test } from 'vitest';
import { URI } from 'vscode-uri';
import { createUriConverter } from '../lib/project/typescriptProject';

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
			const a = uriConverter.asUri(uriConverter.asFileName(URI.parse(uri))).toString();
			const b = URI.parse(uri).toString();
			expect(a).toBe(b);
		}
	});
});
