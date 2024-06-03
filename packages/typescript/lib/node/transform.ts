import type { CodeInformation, SourceMap, SourceScript, TypeScriptServiceScript } from '@volar/language-core';
import { Language, shouldReportDiagnostics } from '@volar/language-core';
import type * as ts from 'typescript';
import { getServiceScript, notEmpty } from './utils';

const transformedDiagnostics = new WeakMap<ts.Diagnostic, ts.Diagnostic | undefined>();
const transformedSourceFile = new WeakSet<ts.SourceFile>();

export function transformCallHierarchyItem(language: Language<string>, item: ts.CallHierarchyItem, filter: (data: CodeInformation) => boolean): ts.CallHierarchyItem {
	const span = transformSpan(language, item.file, item.span, filter);
	const selectionSpan = transformSpan(language, item.file, item.selectionSpan, filter);
	return {
		...item,
		span: span?.textSpan ?? { start: 0, length: 0 },
		selectionSpan: selectionSpan?.textSpan ?? { start: 0, length: 0 },
	};
}

export function transformDiagnostic<T extends ts.Diagnostic>(language: Language<string>, diagnostic: T, isTsc: boolean): T | undefined {
	if (!transformedDiagnostics.has(diagnostic)) {
		transformedDiagnostics.set(diagnostic, undefined);

		const { relatedInformation } = diagnostic;
		if (relatedInformation) {
			diagnostic.relatedInformation = relatedInformation
				.map(d => transformDiagnostic(language, d, isTsc))
				.filter(notEmpty);
		}

		if (
			diagnostic.file !== undefined
			&& diagnostic.start !== undefined
			&& diagnostic.length !== undefined
		) {
			const [serviceScript, sourceScript, map] = getServiceScript(language, diagnostic.file.fileName);
			if (serviceScript) {
				const sourceSpan = transformTextSpan(serviceScript, sourceScript, map, { start: diagnostic.start, length: diagnostic.length }, shouldReportDiagnostics);
				if (sourceSpan) {
					if (isTsc) {
						fillSourceFileText(language, diagnostic.file);
					}
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

// fix https://github.com/vuejs/language-tools/issues/4099 without `incremental`
export function fillSourceFileText(language: Language<string>, sourceFile: ts.SourceFile) {
	if (transformedSourceFile.has(sourceFile)) {
		return;
	}
	transformedSourceFile.add(sourceFile);
	const [serviceScript, sourceScript] = getServiceScript(language, sourceFile.fileName);
	if (serviceScript && !serviceScript.preventLeadingOffset) {
		sourceFile.text = sourceScript.snapshot.getText(0, sourceScript.snapshot.getLength())
			+ sourceFile.text.substring(sourceScript.snapshot.getLength());
	}
}

export function transformFileTextChanges(language: Language<string>, changes: ts.FileTextChanges, filter: (data: CodeInformation) => boolean): ts.FileTextChanges | undefined {
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

export function transformDocumentSpan<T extends ts.DocumentSpan>(language: Language<string>, documentSpan: T, filter: (data: CodeInformation) => boolean, shouldFallback?: boolean): T | undefined {
	let textSpan = transformSpan(language, documentSpan.fileName, documentSpan.textSpan, filter);
	if (!textSpan && shouldFallback) {
		textSpan = {
			fileName: documentSpan.fileName,
			textSpan: { start: 0, length: 0 },
		};
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

export function transformSpan(
	language: Language<string>,
	fileName: string | undefined,
	textSpan: ts.TextSpan | undefined,
	filter: (data: CodeInformation) => boolean
): {
	fileName: string;
	textSpan: ts.TextSpan;
} | undefined {
	if (!fileName || !textSpan) {
		return;
	}
	const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
	if (serviceScript) {
		const sourceSpan = transformTextSpan(serviceScript, sourceScript, map, textSpan, filter);
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
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	map: SourceMap<CodeInformation>,
	textChange: ts.TextChange,
	filter: (data: CodeInformation) => boolean
): ts.TextChange | undefined {
	const sourceSpan = transformTextSpan(serviceScript, sourceScript, map, textChange.span, filter);
	if (sourceSpan) {
		return {
			newText: textChange.newText,
			span: sourceSpan,
		};
	}
}

export function transformTextSpan(
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	map: SourceMap<CodeInformation>,
	textSpan: ts.TextSpan,
	filter: (data: CodeInformation) => boolean
): ts.TextSpan | undefined {
	const start = textSpan.start;
	const end = textSpan.start + textSpan.length;
	const sourceStart = toSourceOffset(serviceScript, sourceScript, map, start, filter);
	const sourceEnd = toSourceOffset(serviceScript, sourceScript, map, end, filter);
	if (sourceStart !== undefined && sourceEnd !== undefined && sourceEnd >= sourceStart) {
		return {
			start: sourceStart,
			length: sourceEnd - sourceStart,
		};
	}
}

export function toSourceOffset(
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	map: SourceMap,
	position: number,
	filter: (data: CodeInformation) => boolean
) {
	for (const [sourceOffset, mapping] of map.getSourceOffsets(position - getMappingOffset(serviceScript, sourceScript))) {
		if (filter(mapping.data)) {
			return sourceOffset;
		}
	}
}

export function toGeneratedOffset(
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	map: SourceMap,
	position: number,
	filter: (data: CodeInformation) => boolean
) {
	for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
		if (filter(mapping.data)) {
			return generateOffset + getMappingOffset(serviceScript, sourceScript);
		}
	}
}

export function* toGeneratedOffsets(
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	map: SourceMap<CodeInformation>,
	position: number
) {
	for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
		yield [generateOffset + getMappingOffset(serviceScript, sourceScript), mapping] as const;
	}
}

export function getMappingOffset(serviceScript: TypeScriptServiceScript, sourceScript: SourceScript<string>) {
	return !serviceScript.preventLeadingOffset
		? sourceScript.snapshot.getLength()
		: 0;
}
