import { createLanguage, type LanguagePlugin } from '@volar/language-core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decorateLanguageServiceHost } from '../lib/node/decorateLanguageServiceHost';

const compilerOptions: ts.CompilerOptions = {
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
};

function createLanguagePlugin(resolveHiddenExtensions: boolean): LanguagePlugin<string> {
	return {
		getLanguageId: fileName => fileName.endsWith('.vfile') ? 'vfile' : undefined,
		createVirtualCode: (_fileName, languageId, snapshot) =>
			languageId === 'vfile'
				? {
					id: 'main',
					languageId: 'typescript',
					snapshot,
					mappings: [],
				}
				: undefined,
		typescript: {
			extraFileExtensions: [{ extension: 'vfile', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }],
			resolveHiddenExtensions,
			getServiceScript: root => ({ code: root, extension: '.ts', scriptKind: ts.ScriptKind.TS }),
		},
	};
}

describe('decorateLanguageServiceHost', () => {
	let root: string;

	beforeAll(() => {
		root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'volar-decorate-'))).replace(/\\/g, '/');
		fs.writeFileSync(`${root}/foo.bar.ts`, 'export const foo = 1;');
		fs.writeFileSync(`${root}/Comp.vfile`, 'export default 1;');
		fs.mkdirSync(`${root}/Dir`);
		fs.writeFileSync(`${root}/Dir/index.vfile`, 'export default 1;');
	});

	afterAll(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	function resolve(moduleNames: string[], resolveHiddenExtensions = false) {
		const containingFile = `${root}/index.ts`;
		const sourceFile = ts.createSourceFile(
			containingFile,
			moduleNames.map(name => `import '${name}';`).join('\n'),
			ts.ScriptTarget.Latest,
			true,
		);
		const moduleLiterals = sourceFile.statements.map(statement =>
			(statement as ts.ImportDeclaration).moduleSpecifier as ts.StringLiteral
		);

		const language = createLanguage<string>([createLanguagePlugin(resolveHiddenExtensions)], new Map(), fileName => {
			if (fs.existsSync(fileName)) {
				language.scripts.set(fileName, ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf8')));
			}
		});
		const moduleResolutionCache = ts.createModuleResolutionCache(root, fileName => fileName, compilerOptions);
		const host: ts.LanguageServiceHost = {
			getCompilationSettings: () => compilerOptions,
			getScriptFileNames: () => [containingFile],
			getScriptVersion: () => '0',
			getScriptSnapshot: () => undefined,
			getCurrentDirectory: () => root,
			getDefaultLibFileName: ts.getDefaultLibFilePath,
			fileExists: ts.sys.fileExists,
			readFile: ts.sys.readFile,
			realpath: ts.sys.realpath,
			directoryExists: ts.sys.directoryExists,
			getDirectories: ts.sys.getDirectories,
			useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
			getModuleResolutionCache: () => moduleResolutionCache,
			resolveModuleNameLiterals: (literals, file, redirectedReference, options, containingSourceFile) =>
				literals.map(literal =>
					ts.resolveModuleName(
						literal.text,
						file,
						options,
						ts.sys,
						moduleResolutionCache,
						redirectedReference,
						ts.getModeForUsageLocation(containingSourceFile, literal, options),
					)
				),
		};

		// Another TypeScript plugin that redirects `./foo` to `./foo.bar`.
		const resolveModuleNameLiterals = host.resolveModuleNameLiterals!;
		host.resolveModuleNameLiterals = (literals, file, ...rest) =>
			resolveModuleNameLiterals(literals, file, ...rest).map((result, i) =>
				literals[i].text === './foo'
					? ts.resolveModuleName('./foo.bar', file, compilerOptions, ts.sys)
					: result
			);

		decorateLanguageServiceHost(ts, language, host);

		return host.resolveModuleNameLiterals!(
			moduleLiterals,
			containingFile,
			undefined,
			compilerOptions,
			sourceFile,
			undefined,
		).map(result => result.resolvedModule?.resolvedFileName);
	}

	it('keeps a patched host resolver for literals in a batch with plugin files', () => {
		expect(resolve(['./foo', './Comp.vfile'])).toEqual([`${root}/foo.bar.ts`, `${root}/Comp.vfile`]);
	});

	it('resolves hidden extensions the host resolver cannot', () => {
		expect(resolve(['./Comp'], true)).toEqual([`${root}/Comp.vfile`]);
		expect(resolve(['./foo', './Comp', './Comp.vfile'], true)).toEqual([
			`${root}/foo.bar.ts`,
			`${root}/Comp.vfile`,
			`${root}/Comp.vfile`,
		]);
	});

	it('does not reuse the failed host resolution when retrying with hidden extensions', () => {
		expect(resolve(['./Dir'], true)).toEqual([`${root}/Dir/index.vfile`]);
	});

	it('leaves unresolvable literals unresolved', () => {
		expect(resolve(['./missing', './missing.vfile'])).toEqual([undefined, undefined]);
	});
});
