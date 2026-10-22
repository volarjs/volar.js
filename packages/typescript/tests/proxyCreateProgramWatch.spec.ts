import type { LanguagePlugin } from '@volar/language-core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { proxyCreateProgram } from '../lib/node/proxyCreateProgram';

const generatedCode = 'export const transformed = true;\n';

const plugin: LanguagePlugin<string> = {
	getLanguageId: fileName => fileName.endsWith('.vfile') ? 'vfile' : undefined,
	createVirtualCode: (_fileName, languageId) =>
		languageId === 'vfile'
			? {
				id: 'main',
				languageId: 'typescript',
				snapshot: ts.ScriptSnapshot.fromString(generatedCode),
				mappings: [],
			}
			: undefined,
	typescript: {
		extraFileExtensions: [{ extension: 'vfile', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }],
		getServiceScript: root => ({
			code: root,
			extension: '.ts',
			scriptKind: ts.ScriptKind.TS,
			preventLeadingOffset: true,
		}),
	},
};

describe('proxyCreateProgram in watch mode', () => {
	let root: string;

	beforeAll(() => {
		root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'volar-watch-'))).replace(/\\/g, '/');
		fs.writeFileSync(`${root}/index.ts`, `import './comp.vfile';\nexport const edit = 0;\n`);
		fs.writeFileSync(`${root}/comp.vfile`, 'source text of the plugin file\n');
	});

	afterAll(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('keeps plugin files transformed after an incremental edit', () => {
		const fileWatchers = new Map<string, ts.FileWatcherCallback>();
		let pendingUpdate: (() => void) | undefined;
		const system: ts.System = {
			...ts.sys,
			watchFile: (fileName, callback) => {
				fileWatchers.set(fileName, callback);
				return { close: () => fileWatchers.delete(fileName) };
			},
			watchDirectory: () => ({ close: () => {} }),
			setTimeout: (callback: () => void) => {
				pendingUpdate = callback;
				return 0;
			},
			clearTimeout: () => {
				pendingUpdate = undefined;
			},
		};
		const createProgram = proxyCreateProgram(ts, ts.createProgram, () => [plugin]);
		const createBuilderProgram: ts.CreateProgram<ts.EmitAndSemanticDiagnosticsBuilderProgram> = (
			rootNames,
			options,
			compilerHost,
			oldProgram,
			configFileParsingDiagnostics,
			projectReferences,
		) =>
			ts.createEmitAndSemanticDiagnosticsBuilderProgram(
				createProgram({
					rootNames: rootNames ?? [],
					options: options ?? {},
					host: compilerHost,
					oldProgram: oldProgram?.getProgram(),
					configFileParsingDiagnostics,
					projectReferences,
				}),
				compilerHost!,
				oldProgram,
				configFileParsingDiagnostics,
			);
		const host = ts.createWatchCompilerHost(
			[`${root}/index.ts`],
			{ noLib: true, types: [], noEmit: true },
			system,
			createBuilderProgram,
			() => {},
			() => {},
		);
		const watch = ts.createWatchProgram(host);
		try {
			const getPluginFileText = () => watch.getProgram().getProgram().getSourceFile(`${root}/comp.vfile`)?.text;
			expect(getPluginFileText()).toBe(generatedCode);

			fs.writeFileSync(`${root}/index.ts`, `import './comp.vfile';\nexport const edit = 1;\n`);
			fileWatchers.get(`${root}/index.ts`)!(`${root}/index.ts`, ts.FileWatcherEventKind.Changed);
			expect(pendingUpdate).toBeDefined();
			pendingUpdate!();

			expect(watch.getProgram().getProgram().getSourceFile(`${root}/index.ts`)?.text).toContain('edit = 1');
			expect(getPluginFileText()).toBe(generatedCode);
		}
		finally {
			watch.close();
		}
	});
});
