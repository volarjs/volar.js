import { Language, CodeInformation, shouldReportDiagnostics, SourceMap, SourceScript } from '@volar/language-core';
import type * as ts from 'typescript';
import { getServiceScript, notEmpty } from './utils';

const transformedDiagnostics = new WeakMap<ts.Diagnostic, ts.Diagnostic | undefined>();

export function transformCallHierarchyItem(language: Language, item: ts.CallHierarchyItem, filter: (data: CodeInformation) => boolean): ts.CallHierarchyItem {
	const span = transformSpan(language, item.file, item.span, filter);
	const selectionSpan = transformSpan(language, item.file, item.selectionSpan, filter);
	return {
		...item,
		span: span?.textSpan ?? { start: 0, length: 0 },
		selectionSpan: selectionSpan?.textSpan ?? { start: 0, length: 0 },
	};
}

export function transformDiagnostic<T extends ts.Diagnostic>(language: Language, diagnostic: T): T | undefined {
	if (!transformedDiagnostics.has(diagnostic)) {
		transformedDiagnostics.set(diagnostic, undefined);

		const { relatedInformation } = diagnostic;

		if (relatedInformation) {
			diagnostic.relatedInformation = relatedInformation
				.map(d => transformDiagnostic(language, d))
				.filter(notEmpty);
		}

		if (
			diagnostic.file !== undefined
			&& diagnostic.start !== undefined
			&& diagnostic.length !== undefined
		) {
			const [serviceScript, sourceScript, map] = getServiceScript(language, diagnostic.file.fileName);
			if (serviceScript) {
				const sourceSpan = transformTextSpan(sourceScript, map, { start: diagnostic.start, length: diagnostic.length }, shouldReportDiagnostics);
				if (sourceSpan) {
					transformedDiagnostics.set(diagnostic, {
						...diagnostic,
						start: sourceSpan.start,
						length: sourceSpan.length,
					});
				}
			}
			else {
				transformedDiagnostics.set(diagnostic, diagnostic);
			}
		}
		else {
			transformedDiagnostics.set(diagnostic, diagnostic);
		}
	}
	return transformedDiagnostics.get(diagnostic) as T | undefined;
}

export function transformFileTextChanges(language: Language, changes: ts.FileTextChanges, filter: (data: CodeInformation) => boolean): ts.FileTextChanges | undefined {
	const [_, source] = getServiceScript(language, changes.fileName);
	if (source) {
		return {
			...changes,
			textChanges: changes.textChanges.map(c => {
				const span = transformSpan(language, changes.fileName, c.span, filter);
				if (span) {
					return {
						...c,
						span: span.textSpan,
					};
				}
			}).filter(notEmpty),
		};
	}
	else {
		return changes;
	}
}

export function transformDocumentSpan<T extends ts.DocumentSpan>(language: Language, documentSpan: T, filter: (data: CodeInformation) => boolean, shouldFallback?: boolean): T | undefined {
	let textSpan = transformSpan(language, documentSpan.fileName, documentSpan.textSpan, filter);
	if (!textSpan && shouldFallback) {
		const [serviceScript] = getServiceScript(language, documentSpan.fileName);
		if (serviceScript) {
			textSpan = {
				fileName: documentSpan.fileName,
				textSpan: { start: 0, length: 0 },
			};
		}
	}
	if (!textSpan) {
		return;
	}
	const contextSpan = transformSpan(language, documentSpan.fileName, documentSpan.contextSpan, filter);
	const originalTextSpan = transformSpan(language, documentSpan.originalFileName, documentSpan.originalTextSpan, filter);
	const originalContextSpan = transformSpan(language, documentSpan.originalFileName, documentSpan.originalContextSpan, filter);
	return {
		...documentSpan,
		fileName: textSpan.fileName,
		textSpan: textSpan.textSpan,
		contextSpan: contextSpan?.textSpan,
		originalFileName: originalTextSpan?.fileName,
		originalTextSpan: originalTextSpan?.textSpan,
		originalContextSpan: originalContextSpan?.textSpan,
	};
}

export function transformSpan(language: Language, fileName: string | undefined, textSpan: ts.TextSpan | undefined, filter: (data: CodeInformation) => boolean): {
	fileName: string;
	textSpan: ts.TextSpan;
} | undefined {
	if (!fileName || !textSpan) {
		return;
	}
	const [virtualFile, sourceScript, map] = getServiceScript(language, fileName);
	if (virtualFile) {
		const sourceSpan = transformTextSpan(sourceScript, map, textSpan, filter);
		if (sourceSpan) {
			return {
				fileName,
				textSpan: sourceSpan,
			};
		}
	}
	else {
		return {
			fileName,
			textSpan,
		};
	}
}

export function transformTextChange(
	sourceScript: SourceScript,
	map: SourceMap<CodeInformation>,
	textChange: ts.TextChange,
	filter: (data: CodeInformation) => boolean,
): ts.TextChange | undefined {
	const sourceSpan = transformTextSpan(sourceScript, map, textChange.span, filter);
	if (sourceSpan) {
		return {
			newText: textChange.newText,
			span: sourceSpan,
		};
	}
}

export function transformTextSpan(
	sourceScript: SourceScript,
	map: SourceMap<CodeInformation>,
	textSpan: ts.TextSpan,
	filter: (data: CodeInformation) => boolean,
): ts.TextSpan | undefined {
	const start = textSpan.start;
	const end = textSpan.start + textSpan.length;
	const sourceStart = toSourceOffset(sourceScript, map, start, filter);
	const sourceEnd = toSourceOffset(sourceScript, map, end, filter);
	if (sourceStart !== undefined && sourceEnd !== undefined && sourceEnd >= sourceStart) {
		return {
			start: sourceStart,
			length: sourceEnd - sourceStart,
		};
	}
}

export function toSourceOffset(sourceScript: SourceScript, map: SourceMap, position: number, filter: (data: CodeInformation) => boolean) {
	for (const [sourceOffset, mapping] of map.getSourceOffsets(position - sourceScript.snapshot.getLength())) {
		if (filter(mapping.data)) {
			return sourceOffset;
		}
	}
}

export function toGeneratedOffset(sourceScript: SourceScript, map: SourceMap, position: number, filter: (data: CodeInformation) => boolean) {
	for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
		if (filter(mapping.data)) {
			return generateOffset + sourceScript.snapshot.getLength();
		}
	}
}
