import type * as ts from 'typescript';
import type { LanguageServer } from '../types';

export async function getInferredCompilerOptions(server: LanguageServer) {
	const [
		implicitProjectConfig_1 = {},
		implicitProjectConfig_2 = {},
	] = await Promise.all([
		server.configurations.get<ts.CompilerOptions>('js/ts.implicitProjectConfig'),
		server.configurations.get<ts.CompilerOptions>('javascript.implicitProjectConfig'),
	]);
	const checkJs = readCheckJs();
	const experimentalDecorators = readExperimentalDecorators();
	const strictNullChecks = readImplicitStrictNullChecks();
	const strictFunctionTypes = readImplicitStrictFunctionTypes();
	const options: ts.CompilerOptions = {
		...inferredProjectCompilerOptions('typescript'),
		allowJs: true,
		allowSyntheticDefaultImports: true,
		allowNonTsExtensions: true,
		resolveJsonModule: true,
		jsx: 1 satisfies ts.JsxEmit.Preserve,
	};

	return options;

	function readCheckJs(): boolean {
		return implicitProjectConfig_1['checkJs']
			?? implicitProjectConfig_2['checkJs']
			?? false;
	}

	function readExperimentalDecorators(): boolean {
		return implicitProjectConfig_1['experimentalDecorators']
			?? implicitProjectConfig_2['experimentalDecorators']
			?? false;
	}

	function readImplicitStrictNullChecks(): boolean {
		return implicitProjectConfig_1['strictNullChecks'] ?? false;
	}

	function readImplicitStrictFunctionTypes(): boolean {
		return implicitProjectConfig_1['strictFunctionTypes'] ?? true;
	}

	function inferredProjectCompilerOptions(projectType: 'typescript' | 'javascript'): ts.CompilerOptions {
		const projectConfig: ts.CompilerOptions = {
			module: 1 satisfies ts.ModuleKind.CommonJS,
			target: 7 satisfies ts.ScriptTarget.ES2020,
			jsx: 1 satisfies ts.JsxEmit.Preserve,
		};

		if (checkJs) {
			projectConfig.checkJs = true;
			if (projectType === 'typescript') {
				projectConfig.allowJs = true;
			}
		}

		if (experimentalDecorators) {
			projectConfig.experimentalDecorators = true;
		}

		if (strictNullChecks) {
			projectConfig.strictNullChecks = true;
		}

		if (strictFunctionTypes) {
			projectConfig.strictFunctionTypes = true;
		}

		if (projectType === 'typescript') {
			projectConfig.sourceMap = true;
		}

		return projectConfig;
	}
}
