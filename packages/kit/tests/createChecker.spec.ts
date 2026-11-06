import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import * as ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { type Diagnostic } from '../index';

vi.mock('typescript', async importOriginal => {
	const ts = await importOriginal<typeof import('typescript')>();
	return { ...ts, createSourceFile: vi.fn(ts.createSourceFile) };
});

it('reuses the parsed source file for all diagnostics in a document', async () => {
	const { createTypeScriptInferredChecker } = await vi.importActual<typeof import('../lib/createChecker')>(
		'../lib/createChecker.ts',
	);
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'volar-kit-'));
	try {
		const fileName = path.join(directory, 'example.ts');
		fs.writeFileSync(fileName, 'const first = 1;\nconst second = 2;\n');
		const checker = createTypeScriptInferredChecker([], [], () => [fileName]);
		const diagnostics: Diagnostic[] = [
			{
				range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } },
				severity: 1,
				code: 1001,
				source: 'example',
				message: 'First diagnostic',
			},
			{
				range: { start: { line: 1, character: 6 }, end: { line: 1, character: 12 } },
				severity: 2,
				code: 1002,
				source: 'example',
				message: 'Second diagnostic',
			},
		];
		vi.mocked(ts.createSourceFile).mockClear();

		const output = stripVTControlCharacters(checker.printErrors(fileName, diagnostics, directory));
		expect(output).toContain('example.ts:1:7 - error example(1001): First diagnostic');
		expect(output).toContain('example.ts:2:7 - warning example(1002): Second diagnostic');
		expect(output).toContain('const first = 1;');
		expect(output).toContain('const second = 2;');
		expect(ts.createSourceFile).toHaveBeenCalledTimes(1);

		expect(checker.printErrors(fileName, [], directory)).toBe('');
		expect(ts.createSourceFile).toHaveBeenCalledTimes(1);
	}
	finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
