import type { Language, LanguagePlugin } from '@volar/language-core';
import * as fs from 'fs';
import { Module } from 'module';
import * as path from 'path';
import type * as ts from 'typescript';

export let getLanguagePlugins: (
	ts: typeof import('typescript'),
	options: ts.CreateProgramOptions,
) => LanguagePlugin<string>[] | {
	languagePlugins: LanguagePlugin<string>[];
	setup?(language: Language<string>): void;
} = () => [];

export function runTsc(
	tscPath: string,
	options: string[] | {
		extraSupportedExtensions: string[];
		extraExtensionsToRemove: string[];
	},
	_getLanguagePlugins: typeof getLanguagePlugins,
	typescriptObject?: string,
) {
	getLanguagePlugins = _getLanguagePlugins;

	let extraSupportedExtensions: string[];
	let extraExtensionsToRemove: string[];

	if (Array.isArray(options)) {
		extraSupportedExtensions = options;
		extraExtensionsToRemove = [];
	}
	else {
		extraSupportedExtensions = options.extraSupportedExtensions;
		extraExtensionsToRemove = options.extraExtensionsToRemove;
	}

	const proxyApiPath = require.resolve('../node/proxyCreateProgram');

	// Mirror the TS v5.7+ tsc shim behavior: enable the V8/JSC bytecode cache
	// so the (huge) transformed tsc source is compiled once and reused on
	// subsequent invocations. Supported by Node 22+; no-op on Bun.
	try {
		Module.enableCompileCache?.();
	}
	catch {}

	// Detect the tsc shim used in TypeScript v5.7+: a tiny preamble that
	// re-exports the actual compiler from a sibling file. Resolve through it
	// up front so transformTscContent operates on the real source.
	const shimRegex = /module\.exports\s*=\s*require\(["'](?<path>\.\/\w+\.js)["']\)/;
	let compilePath = tscPath;
	let tsc = fs.readFileSync(tscPath, 'utf8');
	const shimMatch = shimRegex.exec(tsc);
	if (shimMatch?.groups?.path) {
		compilePath = path.join(path.dirname(tscPath), shimMatch.groups.path);
		tsc = fs.readFileSync(compilePath, 'utf8');
	}

	let transformed = transformTscContent(
		tsc,
		proxyApiPath,
		extraSupportedExtensions,
		extraExtensionsToRemove,
		__filename,
		typescriptObject,
	);
	// Strip UTF-8 BOM — Node's Module._extensions['.js'] does this before
	// compiling; we bypass that wrapper so we replicate it here.
	if (transformed.charCodeAt(0) === 0xFEFF) {
		transformed = transformed.slice(1);
	}

	// Avoid monkey-patching `fs.readFileSync` to inject the transformed source:
	// Bun's module loader does not read source through the JS `fs` API, so the
	// patch is silently ignored. Compile the transformed source directly via
	// the (private but widely-used) Module#_compile, which is honored by both
	// Node and Bun. See https://github.com/oven-sh/bun/issues/4754.
	const m = new Module(compilePath);
	m.filename = compilePath;
	m.paths = (Module as any)._nodeModulePaths(path.dirname(compilePath));
	(m as any)._compile(transformed, compilePath);
}

/**
 * Replaces the code of typescript to add support for additional extensions and language plugins.
 *
 * @param tsc - The original code of typescript.
 * @param proxyApiPath - The path to the proxy API.
 * @param extraSupportedExtensions - An array of additional supported extensions.
 * @param extraExtensionsToRemove - An array of extensions to remove.
 * @param getLanguagePluginsFile - The file to get language plugins from.
 * @param typescriptObject - The object to use as typescript.
 * @returns The modified typescript code.
 */
export function transformTscContent(
	tsc: string,
	proxyApiPath: string,
	extraSupportedExtensions: string[],
	extraExtensionsToRemove: string[],
	getLanguagePluginsFile = __filename,
	typescriptObject = `new Proxy({}, { get(_target, p, _receiver) { return eval(p); } } )`,
) {
	const neededPatchExtenstions = extraSupportedExtensions.filter(ext => !extraExtensionsToRemove.includes(ext));

	// Add allow extensions
	if (extraSupportedExtensions.length) {
		const extsText = extraSupportedExtensions.map(ext => `"${ext}"`).join(', ');
		tsc = replace(
			tsc,
			/supportedTSExtensions = .*(?=;)/,
			s => s + `.map((group, i) => i === 0 ? group.splice(0, 0, ${extsText}) && group : group)`,
		);
		tsc = replace(
			tsc,
			/supportedJSExtensions = .*(?=;)/,
			s => s + `.map((group, i) => i === 0 ? group.splice(0, 0, ${extsText}) && group : group)`,
		);
		tsc = replace(
			tsc,
			/allSupportedExtensions = .*(?=;)/,
			s => s + `.map((group, i) => i === 0 ? group.splice(0, 0, ${extsText}) && group : group)`,
		);
	}
	// Use to emit basename.xxx to basename.d.ts instead of basename.xxx.d.ts
	if (extraExtensionsToRemove.length) {
		const extsText = extraExtensionsToRemove.map(ext => `"${ext}"`).join(', ');
		tsc = replace(tsc, /extensionsToRemove = .*(?=;)/, s => s + `.concat([${extsText}])`);
		// These extensions are stripped on emit, so (like .ts -> .js) the JS file
		// they produce ends in .js. Teach tryGetJSExtensionForFile that mapping,
		// otherwise build mode (tsc -b) declaration emit calls getJSExtensionForFile
		// and Debug.fail()s with "Extension .xxx is unsupported" when it computes a
		// module specifier to one of these files with a "js" ending preference.
		tsc = replace(
			tsc,
			/function tryGetJSExtensionForFile\(/,
			s =>
				`function tryGetJSExtensionForFile(fileName, options) {
			return [${extsText}].some(ext => fileName.endsWith(ext))
				? ".js"
				: _tryGetJSExtensionForFile(fileName, options)
			}\n` + s.replace('tryGetJSExtensionForFile', '_tryGetJSExtensionForFile'),
		);
	}
	// Support for basename.xxx to basename.xxx.d.ts
	if (neededPatchExtenstions.length) {
		const extsText = neededPatchExtenstions.map(ext => `"${ext}"`).join(', ');
		tsc = replace(tsc, /function changeExtension\(/, s =>
			`function changeExtension(path, newExtension) {
			return [${extsText}].some(ext => path.endsWith(ext))
				? path + newExtension
				: _changeExtension(path, newExtension)
			}\n` + s.replace('changeExtension', '_changeExtension'));
	}

	// proxy createProgram
	tsc = replace(
		tsc,
		/function createProgram\(.+\) {/,
		s =>
			`var createProgram = require(${JSON.stringify(proxyApiPath)}).proxyCreateProgram(`
			+ [
				typescriptObject,
				`_createProgram`,
				`require(${JSON.stringify(getLanguagePluginsFile)}).getLanguagePlugins`,
			].join(', ')
			+ `);\n`
			+ s.replace('createProgram', '_createProgram'),
	);

	return tsc;
}

function replace(text: string, search: string | RegExp, replace: (substring: string) => string) {
	const before = text;
	text = text.replace(search, replace);
	const after = text;
	if (after === before) {
		throw new Error('Failed to replace: ' + search);
	}
	return after;
}
