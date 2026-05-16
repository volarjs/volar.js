import type { LanguagePlugin } from '@volar/language-core';
import * as ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { proxyCreateProgram } from '../lib/node/proxyCreateProgram';

// Regression test for the "extensionless imports of plugin-extension files
// fail when the host already has resolveModuleNameLiterals" bug.
//
// Repro: a downstream like glint (`.gts`) sets `resolveHiddenExtensions: true`,
// which makes volar's wrapped `fileExists` answer `Foo.d.ts` as true when
// `Foo.gts` is on disk, so `import Foo from './Foo'` resolves. In `tsc --watch`
// the host already exposes `resolveModuleNameLiterals` (tsc installs the
// resolution cache's resolver on the host). The fast-path in proxyCreateProgram
// used to delegate any batch where no literal had a plugin extension straight
// to the host — bypassing the wrapper — so extensionless imports of `.gts`
// files failed with TS2307 in watch mode while succeeding in one-shot mode.

function noopProgram(): ts.Program {
	return {
		emit: () => ({ emitSkipped: false, diagnostics: [] }) as any,
		getSyntacticDiagnostics: () => [] as any,
		getSemanticDiagnostics: () => [] as any,
		getGlobalDiagnostics: () => [] as any,
		getSourceFileByPath: () => undefined as any,
		getBindAndCheckDiagnostics: () => [],
	} as unknown as ts.Program;
}

function makeHost() {
	const host: ts.CompilerHost = {
		getSourceFile: () => undefined,
		writeFile: () => {},
		getDefaultLibFileName: () => 'lib.d.ts',
		useCaseSensitiveFileNames: () => true,
		getCanonicalFileName: f => f,
		getCurrentDirectory: () => '/',
		getNewLine: () => '\n',
		fileExists: () => false,
		readFile: () => undefined,
		// Simulate `tsc --watch`: the host already has a resolver installed
		// before volar's proxy gets to it.
		resolveModuleNameLiterals: vi.fn(() => []),
	};
	return host;
}

function makePlugin(opts: { resolveHiddenExtensions: boolean }): LanguagePlugin<string> {
	return {
		getLanguageId: () => undefined,
		typescript: {
			extraFileExtensions: [
				{ extension: 'vfile', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred },
			],
			resolveHiddenExtensions: opts.resolveHiddenExtensions,
			getServiceScript: () => undefined,
		},
	};
}

function makeContainingSourceFileWithExtensionlessImport(): {
	sourceFile: ts.SourceFile;
	moduleLiteral: ts.StringLiteral;
} {
	const sourceFile = ts.createSourceFile(
		'/proj/index.ts',
		`import Foo from './Foo';`,
		ts.ScriptTarget.Latest,
		/* setParentNodes */ true,
	);
	const importDecl = sourceFile.statements[0] as ts.ImportDeclaration;
	const moduleLiteral = importDecl.moduleSpecifier as ts.StringLiteral;
	return { sourceFile, moduleLiteral };
}

describe('proxyCreateProgram extensionless imports', () => {
	it('routes extensionless imports through the volar resolver when a plugin sets resolveHiddenExtensions', () => {
		const host = makeHost();
		const originalCreate = vi.fn(() => noopProgram());

		const proxy = proxyCreateProgram(
			ts,
			originalCreate as unknown as typeof ts.createProgram,
			() => [makePlugin({ resolveHiddenExtensions: true })],
		);

		const options: ts.CreateProgramOptions = {
			rootNames: [],
			options: {},
			host,
		};
		(proxy as unknown as (o: ts.CreateProgramOptions) => ts.Program)(options);

		const installed = options.host!.resolveModuleNameLiterals!;
		expect(typeof installed).toBe('function');

		const { sourceFile, moduleLiteral } = makeContainingSourceFileWithExtensionlessImport();
		try {
			installed(
				[moduleLiteral],
				'/proj/index.ts',
				undefined,
				options.options,
				sourceFile,
				undefined,
			);
		}
		catch {
			// The volar-aware resolver may throw when trying to resolve against
			// our minimal host — what matters is which path was taken.
		}

		expect(host.resolveModuleNameLiterals).not.toHaveBeenCalled();
	});

	it('still delegates extensionless imports to the host resolver when no plugin sets resolveHiddenExtensions', () => {
		const host = makeHost();
		const originalCreate = vi.fn(() => noopProgram());

		const proxy = proxyCreateProgram(
			ts,
			originalCreate as unknown as typeof ts.createProgram,
			() => [makePlugin({ resolveHiddenExtensions: false })],
		);

		const options: ts.CreateProgramOptions = {
			rootNames: [],
			options: {},
			host,
		};
		(proxy as unknown as (o: ts.CreateProgramOptions) => ts.Program)(options);

		const installed = options.host!.resolveModuleNameLiterals!;
		const { sourceFile, moduleLiteral } = makeContainingSourceFileWithExtensionlessImport();
		installed(
			[moduleLiteral],
			'/proj/index.ts',
			undefined,
			options.options,
			sourceFile,
			undefined,
		);

		expect(host.resolveModuleNameLiterals).toHaveBeenCalledOnce();
	});
});
