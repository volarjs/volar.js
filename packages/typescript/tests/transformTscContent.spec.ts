import { readFileSync } from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { transformTscContent } from '../lib/quickstart/runTsc';

// Reads the real tsc source the way `runTsc` does, transparently following the
// thin shim that TypeScript >= 5.7 ships (`module.exports = require("./_tsc.js")`).
function loadTscSource(): string {
	const tscPath = require.resolve('typescript/lib/tsc.js');
	const source = readFileSync(tscPath, 'utf8');
	const shim = /module\.exports\s*=\s*require\((?:"|')(?<path>\.\/\w+\.js)(?:"|')\)/.exec(source);
	if (shim?.groups?.path) {
		return readFileSync(path.join(path.dirname(tscPath), shim.groups.path), 'utf8');
	}
	return source;
}

const PROXY_API_PATH = '@volar/typescript/lib/node/proxyCreateProgram';

describe('transformTscContent', () => {
	it('teaches tryGetJSExtensionForFile that stripped extensions emit .js', () => {
		const transformed = transformTscContent(
			loadTscSource(),
			PROXY_API_PATH,
			['.gjs', '.gts'],
			['.gjs', '.gts'],
		);

		// The original implementation is renamed and a delegating wrapper is added,
		// mirroring how `changeExtension` is patched.
		expect(transformed).toContain('function _tryGetJSExtensionForFile(');
		expect(transformed).toMatch(
			/\[".gjs", ".gts"\]\.some\(ext => fileName\.endsWith\(ext\)\)\s*\?\s*".js"/,
		);

		// The patched source must still be syntactically valid JS (a broken
		// injection would otherwise crash every consumer at require time).
		expect(() => new Function(transformed)).not.toThrow();
	});

	it('releases per-project state when the build order of the solution builder changes', () => {
		const transformed = transformTscContent(loadTscSource(), PROXY_API_PATH, ['.vue'], []);

		expect(transformed).toMatch(
			/mutateMapSkippingNewValues\(state\.builderPrograms, currentProjects, noopOnDelete\);\s*require\(".+"\)\.releaseRemovedProjects\?\.\(createProgram, configFilePath => currentProjects\.has\(configFilePath\)\);/,
		);
		expect(() => new Function(transformed)).not.toThrow();
	});

	it('leaves tryGetJSExtensionForFile untouched when no extensions are stripped', () => {
		// e.g. Vue keeps `.vue` (foo.vue -> foo.vue.d.ts), so there is nothing to map.
		const transformed = transformTscContent(loadTscSource(), PROXY_API_PATH, ['.vue'], []);

		expect(transformed).not.toContain('_tryGetJSExtensionForFile');
	});
});
