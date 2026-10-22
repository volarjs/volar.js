import type { LanguagePlugin, SourceScript } from '@volar/language-core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createResolveModuleName } from '../lib/resolveModuleName';

const languagePlugin: LanguagePlugin<string> = {
	getLanguageId: () => undefined,
	typescript: {
		extraFileExtensions: [{ extension: 'vue', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }],
		getServiceScript: () => ({ code: undefined as any, extension: '.ts', scriptKind: ts.ScriptKind.TS }),
	},
};

describe('createResolveModuleName', () => {
	let root: string;

	beforeAll(() => {
		// Match ts.sys.realpath, which also expands Windows 8.3 short names such as RUNNER~1.
		root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'volar-resolve-'))).replace(/\\/g, '/');
		fs.mkdirSync(`${root}/packages/ui/src`, { recursive: true });
		fs.writeFileSync(`${root}/packages/ui/package.json`, JSON.stringify({ name: '@acme/ui' }));
		fs.writeFileSync(`${root}/packages/ui/src/Header.vue`, '');
		fs.mkdirSync(`${root}/apps/web/src`, { recursive: true });
		fs.mkdirSync(`${root}/apps/web/node_modules/@acme`, { recursive: true });
		fs.symlinkSync(`${root}/packages/ui`, `${root}/apps/web/node_modules/@acme/ui`, 'junction');
		fs.writeFileSync(`${root}/apps/web/src/index.ts`, '');
	});

	afterAll(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	function resolve(
		moduleName: string,
		containingFile: string,
		compilerOptions: ts.CompilerOptions,
	): (ts.ResolvedModuleFull & { originalPath?: string }) | undefined {
		const resolveModuleName = createResolveModuleName(
			ts,
			undefined,
			ts.sys,
			[languagePlugin],
			fileName =>
				fileName.endsWith('.vue')
					? { generated: { root: {}, languagePlugin } } as unknown as SourceScript<string>
					: undefined,
		);
		return resolveModuleName(moduleName, containingFile, {
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			module: ts.ModuleKind.ESNext,
			...compilerOptions,
		}).resolvedModule;
	}

	test('resolves a plugin file in a symlinked package to its real path', () => {
		const resolved = resolve('@acme/ui/src/Header.vue', `${root}/apps/web/src/index.ts`, {});
		expect(resolved?.resolvedFileName).toBe(`${root}/packages/ui/src/Header.vue`);
		expect(resolved?.originalPath).toBe(`${root}/apps/web/node_modules/@acme/ui/src/Header.vue`);
		expect(resolved?.extension).toBe('.ts');
	});

	test('keeps the symlinked path with preserveSymlinks', () => {
		const resolved = resolve('@acme/ui/src/Header.vue', `${root}/apps/web/src/index.ts`, { preserveSymlinks: true });
		expect(resolved?.resolvedFileName).toBe(`${root}/apps/web/node_modules/@acme/ui/src/Header.vue`);
		expect(resolved?.originalPath).toBeUndefined();
	});

	test('keeps the path of a relative import', () => {
		const containingFile = `${root}/apps/web/node_modules/@acme/ui/src/index.ts`;
		const resolved = resolve('./Header.vue', containingFile, {});
		expect(resolved?.resolvedFileName).toBe(`${root}/apps/web/node_modules/@acme/ui/src/Header.vue`);
		expect(resolved?.originalPath).toBeUndefined();
	});
});
