import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { describe, expect, test } from 'vitest';

const packagesDir = path.resolve(__dirname, '../..');
const builtinModules = new Set(require('module').builtinModules as string[]);
// `vscode` is provided by the extension host; `@volar/language-server` is still a devDependency.
const knownUndeclared: Record<string, string[]> = {
	'@volar/vscode': ['vscode', '@volar/language-server'],
};

function* walkDeclarations(dir: string): Generator<string> {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === 'tests') {
			continue;
		}
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walkDeclarations(fullPath);
		}
		else if (entry.name.endsWith('.d.ts')) {
			yield fullPath;
		}
	}
}

function toPackageName(specifier: string) {
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

describe('published declarations', () => {
	for (const name of fs.readdirSync(packagesDir)) {
		const packageDir = path.join(packagesDir, name);
		const packageJsonPath = path.join(packageDir, 'package.json');
		if (!fs.existsSync(packageJsonPath)) {
			continue;
		}
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		if (packageJson.private) {
			continue;
		}

		test(`${packageJson.name} declares every module its .d.ts files import`, () => {
			const declared = new Set([
				packageJson.name,
				...knownUndeclared[packageJson.name] ?? [],
			]);
			const deps = [
				...Object.keys(packageJson.dependencies ?? {}),
				...Object.keys(packageJson.peerDependencies ?? {}),
			];
			for (const dep of deps) {
				declared.add(dep.startsWith('@types/') ? dep.slice('@types/'.length).replace(/^(.+)__/, '@$1/') : dep);
			}
			const files = [...walkDeclarations(packageDir)];
			expect(files.length, 'run the build before testing').toBeGreaterThan(0);

			const undeclared = new Set<string>();
			for (const file of files) {
				const { importedFiles } = ts.preProcessFile(fs.readFileSync(file, 'utf8'), true, true);
				for (const { fileName } of importedFiles) {
					if (fileName.startsWith('.') || fileName.startsWith('node:') || builtinModules.has(fileName)) {
						continue;
					}
					const packageName = toPackageName(fileName);
					if (!declared.has(packageName)) {
						undeclared.add(`${packageName} (${path.relative(packageDir, file).replace(/\\/g, '/')})`);
					}
				}
			}
			expect([...undeclared]).toEqual([]);
		});
	}
});
