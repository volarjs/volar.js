import { describe, expect, test } from 'vitest';

describe('vscode', () => {
	test('vscode versions should be consistent ', () => {
		const languageClientVersion = require('vscode-languageclient/package.json').engines.vscode;
		const typesVersion = require('../package.json').devDependencies['@types/vscode'];

		expect(typesVersion).toBe(languageClientVersion);
	});
});
