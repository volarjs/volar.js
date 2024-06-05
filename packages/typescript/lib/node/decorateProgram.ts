import type { Language } from '@volar/language-core';
import type * as ts from 'typescript';
import { getServiceScript, notEmpty } from './utils';
import { transformDiagnostic, fillSourceFileText, transformAndFilterDiagnostics } from './transform';

export function decorateProgram(language: Language<string>, program: ts.Program) {

	const emit = program.emit;

	// for tsc --noEmit
	const getSyntacticDiagnostics = program.getSyntacticDiagnostics;
	const getSemanticDiagnostics = program.getSemanticDiagnostics;
	const getGlobalDiagnostics = program.getGlobalDiagnostics;
	const getSourceFileByPath = program.getSourceFileByPath;

	// for tsc --noEmit --watch
	// @ts-ignore
	const getBindAndCheckDiagnostics = program.getBindAndCheckDiagnostics;

	program.emit = (...args) => {
		const result = emit(...args);
		return {
			...result,
			diagnostics: result.diagnostics
				.map(d => transformDiagnostic(language, d, program, true))
				.filter(notEmpty),
		};
	};
	program.getSyntacticDiagnostics = (sourceFile, cancellationToken) => {
		if (!sourceFile) {
			return []
		}
		const [_serviceScript, sourceScript] = getServiceScript(language, sourceFile.fileName);
		const actualSourceFile = sourceScript ? program.getSourceFile(sourceScript.id) : sourceFile;
		return transformAndFilterDiagnostics(getSyntacticDiagnostics(actualSourceFile, cancellationToken),
			language, sourceFile.fileName, program, true)
	};
	program.getSemanticDiagnostics = (sourceFile, cancellationToken) => {
		if (!sourceFile) {
			return []
		}
		const [_serviceScript, sourceScript] = getServiceScript(language, sourceFile.fileName);
		const actualSourceFile = sourceScript ? program.getSourceFile(sourceScript.id) : sourceFile;
		return transformAndFilterDiagnostics(getSemanticDiagnostics(actualSourceFile, cancellationToken),
			language, sourceFile.fileName, program, true)
	};
	program.getGlobalDiagnostics = cancellationToken => {
		return getGlobalDiagnostics(cancellationToken)
			.map(d => transformDiagnostic(language, d, program, true))
			.filter(notEmpty);
	};
	// @ts-ignore
	program.getBindAndCheckDiagnostics = (sourceFile, cancellationToken) => {
		if (!sourceFile) {
			return []
		}
		const [_serviceScript, sourceScript] = getServiceScript(language, sourceFile.fileName);
		const actualSourceFile = sourceScript ? program.getSourceFile(sourceScript.id) : sourceFile;
		return transformAndFilterDiagnostics((getBindAndCheckDiagnostics as typeof getSyntacticDiagnostics)(actualSourceFile, cancellationToken),
			language, sourceFile.fileName, program, true)
	};

	// fix https://github.com/vuejs/language-tools/issues/4099 with `incremental`
	program.getSourceFileByPath = path => {
		const sourceFile = getSourceFileByPath(path);
		if (sourceFile) {
			fillSourceFileText(language, sourceFile);
		}
		return sourceFile;
	};
}
