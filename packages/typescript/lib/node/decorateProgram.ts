import type { FileRegistry } from '@volar/language-core';
import type * as ts from 'typescript';
import { notEmpty } from './utils';
import { transformDiagnostic } from './transform';

export function decorateProgram(files: FileRegistry, program: ts.Program) {

	const emit = program.emit;

	// for tsc --noEmit
	const getSyntacticDiagnostics = program.getSyntacticDiagnostics;
	const getSemanticDiagnostics = program.getSemanticDiagnostics;
	const getGlobalDiagnostics = program.getGlobalDiagnostics;

	// for tsc --noEmit --watch
	// @ts-ignore
	const getBindAndCheckDiagnostics = program.getBindAndCheckDiagnostics;

	program.emit = (...args) => {
		const result = emit(...args);
		return {
			...result,
			diagnostics: result.diagnostics
				.map(d => transformDiagnostic(files, d))
				.filter(notEmpty),
		};
	};
	program.getSyntacticDiagnostics = (sourceFile, cancellationToken) => {
		return getSyntacticDiagnostics(sourceFile, cancellationToken)
			.map(d => transformDiagnostic(files, d))
			.filter(notEmpty);
	};
	program.getSemanticDiagnostics = (sourceFile, cancellationToken) => {
		return getSemanticDiagnostics(sourceFile, cancellationToken)
			.map(d => transformDiagnostic(files, d))
			.filter(notEmpty);
	};
	program.getGlobalDiagnostics = cancellationToken => {
		return getGlobalDiagnostics(cancellationToken)
			.map(d => transformDiagnostic(files, d))
			.filter(notEmpty);
	};
	// @ts-ignore
	program.getBindAndCheckDiagnostics = (sourceFile, cancellationToken) => {
		return (getBindAndCheckDiagnostics as typeof getSyntacticDiagnostics)(sourceFile, cancellationToken)
			.map(d => transformDiagnostic(files, d))
			.filter(notEmpty);
	};
}
