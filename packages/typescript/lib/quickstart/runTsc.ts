import * as fs from 'fs';
import type * as ts from 'typescript';
import type { LanguagePlugin } from '@volar/language-core';

export let getLanguagePlugins: (ts: typeof import('typescript'), options: ts.CreateProgramOptions) => LanguagePlugin[] = () => [];

export function runTsc(
	tscPath: string,
	extensions: string[],
	_getLanguagePlugins: typeof getLanguagePlugins,
) {

	getLanguagePlugins = _getLanguagePlugins;

	const proxyApiPath = require.resolve('../node/proxyCreateProgram');
	const readFileSync = fs.readFileSync;

	(fs as any).readFileSync = (...args: any[]) => {
		if (args[0] === tscPath) {
			let tsc = (readFileSync as any)(...args) as string;

			// add allow extensions
			const extsText = extensions.map(ext => `"${ext}"`).join(', ');
			tsc = replace(tsc, /supportedTSExtensions = .*(?=;)/, s => s + `.concat([[${extsText}]])`);
			tsc = replace(tsc, /supportedJSExtensions = .*(?=;)/, s => s + `.concat([[${extsText}]])`);
			tsc = replace(tsc, /allSupportedExtensions = .*(?=;)/, s => s + `.concat([[${extsText}]])`);

			// proxy createProgram
			tsc = replace(tsc, /function createProgram\(.+\) {/, s =>
				`var createProgram = require(${JSON.stringify(proxyApiPath)}).proxyCreateProgram(`
				+ `new Proxy({}, { get(_target, p, _receiver) { return eval(p); } } ), `
				+ `_createProgram, `
				+ `[${extsText}], `
				+ `require(${JSON.stringify(__filename)}).getLanguagePlugins`
				+ `);\n`
				+ s.replace('createProgram', '_createProgram')
			);

			return tsc;
		}
		return (readFileSync as any)(...args);
	};

	try {
		require(tscPath);
	} finally {
		(fs as any).readFileSync = readFileSync;
		delete require.cache[tscPath];
	}
}

function replace(text: string, ...[search, replace]: Parameters<String['replace']>) {
	const before = text;
	text = text.replace(search, replace);
	const after = text;
	if (after === before) {
		throw 'Search string not found: ' + JSON.stringify(search.toString());
	}
	return after;
}
