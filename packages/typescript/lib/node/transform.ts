import type { CodeInformation, SourceMap, SourceScript, TypeScriptServiceScript } from '@volar/language-core';
import { Language, shouldReportDiagnostics } from '@volar/language-core';
import type * as ts from 'typescript';
import { getServiceScript, notEmpty } from './utils';
import type { TextChange } from "typescript";

const transformedDiagnostics = new WeakMap<ts.Diagnostic, ts.Diagnostic | undefined>();
const transformedSourceFile = new WeakSet<ts.SourceFile>();

export function transformCallHierarchyItem(language: Language<string>, item: ts.CallHierarchyItem, filter: (data: CodeInformation) => boolean): ts.CallHierarchyItem {
	const span = transformSpan(language, item.file, item.span, filter);
	const selectionSpan = transformSpan(language, item.file, item.selectionSpan, filter);
	return {
		...item,
		file: span?.fileName ?? item.file,
		span: span?.textSpan ?? { start: 0, length: 0 },
		selectionSpan: selectionSpan?.textSpan ?? { start: 0, length: 0 },
	};
}


export function transformAndFilterDiagnostics<T extends ts.Diagnostic>(diagnostics: readonly T[], language: Language<string>, fileName: string, program: ts.Program | undefined, isTsc: boolean): T[] {
	return diagnostics.map(d => transformDiagnostic(language, d, program, isTsc))
		.filter(d => d?.file?.fileName == fileName)
		.filter(notEmpty)
}

export function transformDiagnostic<T extends ts.Diagnostic>(language: Language<string>, diagnostic: T, program: ts.Program | undefined, isTsc: boolean): T | undefined {
	if (!transformedDiagnostics.has(diagnostic)) {
		transformedDiagnostics.set(diagnostic, undefined);

		const { relatedInformation } = diagnostic;
		if (relatedInformation) {
			diagnostic.relatedInformation = relatedInformation
				.map(d => transformDiagnostic(language, d, program, isTsc))
				.filter(notEmpty);
		}

		if (
			diagnostic.file !== undefined
			&& diagnostic.start !== undefined
			&& diagnostic.length !== undefined
		) {
			const [serviceScript, sourceScript, map] = getServiceScript(language, diagnostic.file.fileName);
			if (serviceScript) {
				const [sourceSpanFileName, sourceSpan] = transformTextSpan(serviceScript, sourceScript, map, {
					start: diagnostic.start,
					length: diagnostic.length
				}, shouldReportDiagnostics) ?? [];
				const actualDiagnosticFile = sourceSpanFileName
					? diagnostic.file.fileName === sourceSpanFileName
						? diagnostic.file
						: program?.getSourceFile(sourceSpanFileName)
					: undefined;
				if (sourceSpan && actualDiagnosticFile) {
					if (isTsc) {
						fillSourceFileText(language, diagnostic.file);
					}
					transformedDiagnostics.set(diagnostic, {
						...diagnostic,
						file: actualDiagnosticFile,
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

export function transformFileTextChanges(language: Language<string>, changes: readonly ts.FileTextChanges[], filter: (data: CodeInformation) => boolean): ts.FileTextChanges[] {
	const changesPerFile: { [fileName: string]: TextChange[] } = {}
	const newFiles = new Set<string>();
	for (const fileChanges of changes) {
		const [_, source] = getServiceScript(language, fileChanges.fileName);
		if (source) {
			fileChanges.textChanges.forEach(c => {
				const { fileName, textSpan } = transformSpan(language, fileChanges.fileName, c.span, filter) ?? {};
				if (fileName && textSpan) {
					(changesPerFile[fileName] ?? (changesPerFile[fileName] = [])).push({ ...c, span: textSpan })
				}
			})

		} else {
			const list = (changesPerFile[fileChanges.fileName] ?? (changesPerFile[fileChanges.fileName] = []))
			fileChanges.textChanges.forEach(c => {
				list.push(c)
			})
			if (fileChanges.isNewFile) {
				newFiles.add(fileChanges.fileName)
			}
		}
	}
	const result: ts.FileTextChanges[] = []
	for (const fileName in changesPerFile) {
		result.push({
			fileName,
			isNewFile: newFiles.has(fileName),
			textChanges: changesPerFile[fileName]
		})
	}
	return result
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
	if (sourceScript?.associatedOnly) {
		return;
	} else if (serviceScript) {
		const [sourceSpanFileName, sourceSpan] = transformTextSpan(serviceScript, sourceScript, map, textSpan, filter) ?? [];
		if (sourceSpan && sourceSpanFileName) {
			return {
				fileName: sourceSpanFileName,
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
	map: SourceMap<CodeInformation, string>,
	textChange: ts.TextChange,
	filter: (data: CodeInformation) => boolean
): [string, ts.TextChange] | undefined {
	const [sourceSpanFileName, sourceSpan] = transformTextSpan(serviceScript, sourceScript, map, textChange.span, filter) ?? [];
	if (sourceSpan && sourceSpanFileName) {
		return [sourceSpanFileName, {
			newText: textChange.newText,
			span: sourceSpan,
		}];
	}
	return undefined;
}

export function transformTextSpan(
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	map: SourceMap<CodeInformation, string>,
	textSpan: ts.TextSpan,
	filter: (data: CodeInformation) => boolean
): [string, ts.TextSpan] | undefined {
	const start = textSpan.start;
	const end = textSpan.start + textSpan.length;
	const [idStart, sourceStart] = toSourceOffset(serviceScript, sourceScript, map, start, filter) ?? [];
	const [idEnd, sourceEnd] = toSourceOffset(serviceScript, sourceScript, map, end, filter) ?? [];
	if (idStart === idEnd && idStart !== undefined
		&& sourceStart !== undefined && sourceEnd !== undefined && sourceEnd >= sourceStart) {
		return [idStart, {
			start: sourceStart,
			length: sourceEnd - sourceStart,
		}];
	}
	return undefined;
}

export function toSourceOffset(
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	map: SourceMap<CodeInformation, string>,
	position: number,
	filter: (data: CodeInformation) => boolean
): [string, number] | undefined {
	for (const [sourceOffset, mapping] of map.getSourceOffsets(position - getMappingOffset(serviceScript, sourceScript))) {
		if (filter(mapping.data)) {
			return [mapping.source ?? sourceScript.id, sourceOffset];
		}
	}
	return undefined
}

export function toGeneratedOffset(
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	map: SourceMap<CodeInformation>,
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
