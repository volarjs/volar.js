import type { Language } from '@volar/language-core';
import type * as ts from 'typescript';
import { notEmpty } from './utils';
import { transformDiagnostic } from './transform';

export function decorateProgram(language: Language, program: ts.Program) {

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
				.map(d => transformDiagnostic(language, d))
				.filter(notEmpty),
		};
	};
	program.getSyntacticDiagnostics = (sourceFile, cancellationToken) => {
		return getSyntacticDiagnostics(sourceFile, cancellationToken)
			.map(d => transformDiagnostic(language, d))
			.filter(notEmpty);
	};
	program.getSemanticDiagnostics = (sourceFile, cancellationToken) => {
		return getSemanticDiagnostics(sourceFile, cancellationToken)
			.map(d => transformDiagnostic(language, d))
			.filter(notEmpty);
	};
	program.getGlobalDiagnostics = cancellationToken => {
		return getGlobalDiagnostics(cancellationToken)
			.map(d => transformDiagnostic(language, d))
			.filter(notEmpty);
	};
	// @ts-ignore
	program.getBindAndCheckDiagnostics = (sourceFile, cancellationToken) => {
		return (getBindAndCheckDiagnostics as typeof getSyntacticDiagnostics)(sourceFile, cancellationToken)
			.map(d => transformDiagnostic(language, d))
			.filter(notEmpty);
	};

	// fix https://github.com/vuejs/language-tools/issues/4099
	program.getSourceFileByPath = path => {
		const sourceFile = getSourceFileByPath(path);
		if (sourceFile) {
			const sourceScript = language.scripts.get(sourceFile.fileName);
			if (sourceScript?.generated) {
				sourceFile.text = sourceScript.snapshot.getText(0, sourceScript.snapshot.getLength())
					+ sourceFile.text.substring(sourceScript.snapshot.getLength());
			}
		}
		return sourceFile;
	};
}
