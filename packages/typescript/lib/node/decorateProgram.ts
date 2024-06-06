import type { Language } from '@volar/language-core';
import type * as ts from 'typescript';
import { ToSourceMode, fillSourceFileText, transformDiagnostic } from './transform';
import { getServiceScript, notEmpty } from './utils';

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
				.map(d => transformDiagnostic(ToSourceMode.IncludeAssciated, language, d, program, true))
				.filter(notEmpty),
		};
	};
	program.getSyntacticDiagnostics = (sourceFile, cancellationToken) => {
		if (!sourceFile) {
			return [];
		}
		const [_serviceScript, sourceScript] = getServiceScript(language, sourceFile.fileName);
		const actualSourceFile = sourceScript ? program.getSourceFile(sourceScript.id) : sourceFile;
		return getSyntacticDiagnostics(actualSourceFile, cancellationToken)
			.map(d => transformDiagnostic(ToSourceMode.SkipAssciated, language, d, program, true))
			.filter(notEmpty);
	};
	program.getSemanticDiagnostics = (sourceFile, cancellationToken) => {
		if (!sourceFile) {
			return [];
		}
		const [_serviceScript, sourceScript] = getServiceScript(language, sourceFile.fileName);
		const actualSourceFile = sourceScript ? program.getSourceFile(sourceScript.id) : sourceFile;
		return getSemanticDiagnostics(actualSourceFile, cancellationToken)
			.map(d => transformDiagnostic(ToSourceMode.SkipAssciated, language, d, program, true))
			.filter(notEmpty);
	};
	program.getGlobalDiagnostics = cancellationToken => {
		return getGlobalDiagnostics(cancellationToken)
			.map(d => transformDiagnostic(ToSourceMode.IncludeAssciated, language, d, program, true))
			.filter(notEmpty);
	};
	// @ts-ignore
	program.getBindAndCheckDiagnostics = (sourceFile, cancellationToken) => {
		if (!sourceFile) {
			return [];
		}
		const [_serviceScript, sourceScript] = getServiceScript(language, sourceFile.fileName);
		const actualSourceFile = sourceScript ? program.getSourceFile(sourceScript.id) : sourceFile;
		return (getBindAndCheckDiagnostics as typeof getSyntacticDiagnostics)(actualSourceFile, cancellationToken)
			.map(d => transformDiagnostic(ToSourceMode.SkipAssciated, language, d, program, true))
			.filter(notEmpty);
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
