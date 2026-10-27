import * as fs from 'fs';
import * as path from 'path';
import type * as TypeScriptAST from 'typescript-7/ast' with { 'resolution-mode': 'import' };
import type { API } from 'typescript-7/sync' with { 'resolution-mode': 'import' };
import { afterAll, describe, expect, test } from 'vitest';

const ts: typeof TypeScriptAST = require('typescript-7/ast');
const { API: TypeScriptAPI }: { API: typeof API } = require('typescript-7/sync');

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

/** The modules that a declaration file imports, exports from, imports types of, or augments. */
function getImportedModules(api: API, fileName: string, text: string) {
	const retained = api.createSourceFile(fileName, text);
	const moduleNames: string[] = [];
	visit(retained.sourceFile);
	retained.dispose();
	return moduleNames;

	function visit(node: TypeScriptAST.Node) {
		const specifier = getModuleSpecifier(node);
		if (specifier && ts.isStringLiteral(specifier)) {
			moduleNames.push(specifier.text);
		}
		node.forEachChild(visit);
	}

	function getModuleSpecifier(node: TypeScriptAST.Node) {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			return node.moduleSpecifier;
		}
		if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
			return node.moduleReference.expression;
		}
		if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
			return node.argument.literal;
		}
		if (ts.isModuleDeclaration(node)) {
			return node.name;
		}
	}
}

function toPackageName(specifier: string) {
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

describe('published declarations', () => {
	const api = new TypeScriptAPI();
	afterAll(() => api.close());

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
				for (const fileName of getImportedModules(api, file, fs.readFileSync(file, 'utf8'))) {
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
