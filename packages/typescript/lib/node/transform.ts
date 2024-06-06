import type { CodeInformation, SourceMap, SourceScript, TypeScriptServiceScript } from '@volar/language-core';
import { Language, shouldReportDiagnostics } from '@volar/language-core';
import type * as ts from 'typescript';
import { getServiceScript, notEmpty } from './utils';
import type { TextChange } from "typescript";

export enum ToSourceMode {
	IncludeAssciated,
	SkipAssciated,
}

const transformedDiagnostics = new WeakMap<ts.Diagnostic, ts.Diagnostic | undefined>();
const transformedSourceFile = new WeakSet<ts.SourceFile>();

export function transformCallHierarchyItem(
	mode: ToSourceMode,
	language: Language<string>,
	item: ts.CallHierarchyItem,
	filter: (data: CodeInformation) => boolean
): ts.CallHierarchyItem {
	const span = transformSpan(mode, language, item.file, item.span, filter);
	const selectionSpan = transformSpan(mode, language, item.file, item.selectionSpan, filter);
	return {
		...item,
		file: span?.fileName ?? item.file,
		span: span?.textSpan ?? { start: 0, length: 0 },
		selectionSpan: selectionSpan?.textSpan ?? { start: 0, length: 0 },
	};
}

export function transformDiagnostic<T extends ts.Diagnostic>(
	mode: ToSourceMode,
	language: Language<string>,
	diagnostic: T,
	program: ts.Program | undefined,
	isTsc: boolean
): T | undefined {
	if (!transformedDiagnostics.has(diagnostic)) {
		transformedDiagnostics.set(diagnostic, undefined);

		const { relatedInformation } = diagnostic;
		if (relatedInformation) {
			diagnostic.relatedInformation = relatedInformation
				.map(d => transformDiagnostic(mode, language, d, program, isTsc))
				.filter(notEmpty);
		}

		if (
			diagnostic.file !== undefined
			&& diagnostic.start !== undefined
			&& diagnostic.length !== undefined
		) {
			const [serviceScript, sourceScript] = getServiceScript(language, diagnostic.file.fileName);
			if (serviceScript) {
				const [sourceSpanFileName, sourceSpan] = transformTextSpan(mode, language, serviceScript, sourceScript, {
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

export function transformFileTextChanges(
	mode: ToSourceMode,
	language: Language<string>,
	changes: readonly ts.FileTextChanges[],
	filter: (data: CodeInformation) => boolean
): ts.FileTextChanges[] {
	const changesPerFile: { [fileName: string]: TextChange[]; } = {};
	const newFiles = new Set<string>();
	for (const fileChanges of changes) {
		const [_, source] = getServiceScript(language, fileChanges.fileName);
		if (source) {
			fileChanges.textChanges.forEach(c => {
				const { fileName, textSpan } = transformSpan(mode, language, fileChanges.fileName, c.span, filter) ?? {};
				if (fileName && textSpan) {
					(changesPerFile[fileName] ?? (changesPerFile[fileName] = [])).push({ ...c, span: textSpan });
				}
			});

		} else {
			const list = (changesPerFile[fileChanges.fileName] ?? (changesPerFile[fileChanges.fileName] = []));
			fileChanges.textChanges.forEach(c => {
				list.push(c);
			});
			if (fileChanges.isNewFile) {
				newFiles.add(fileChanges.fileName);
			}
		}
	}
	const result: ts.FileTextChanges[] = [];
	for (const fileName in changesPerFile) {
		result.push({
			fileName,
			isNewFile: newFiles.has(fileName),
			textChanges: changesPerFile[fileName]
		});
	}
	return result;
}

export function transformDocumentSpan<T extends ts.DocumentSpan>(
	mode: ToSourceMode,
	language: Language<string>,
	documentSpan: T,
	filter: (data: CodeInformation) => boolean,
	shouldFallback?: boolean
): T | undefined {
	let textSpan = transformSpan(mode, language, documentSpan.fileName, documentSpan.textSpan, filter);
	if (!textSpan && shouldFallback) {
		textSpan = {
			fileName: documentSpan.fileName,
			textSpan: { start: 0, length: 0 },
		};
	}
	if (!textSpan) {
		return;
	}
	const contextSpan = transformSpan(mode, language, documentSpan.fileName, documentSpan.contextSpan, filter);
	const originalTextSpan = transformSpan(mode, language, documentSpan.originalFileName, documentSpan.originalTextSpan, filter);
	const originalContextSpan = transformSpan(mode, language, documentSpan.originalFileName, documentSpan.originalContextSpan, filter);
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
	mode: ToSourceMode,
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
	const [serviceScript, sourceScript] = getServiceScript(language, fileName);
	if (sourceScript?.associatedOnly) {
		return;
	}
	else if (serviceScript) {
		const [sourceSpanFileName, sourceSpan] = transformTextSpan(mode, language, serviceScript, sourceScript, textSpan, filter) ?? [];
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
	mode: ToSourceMode,
	language: Language<string>,
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	textChange: ts.TextChange,
	filter: (data: CodeInformation) => boolean
): [string, ts.TextChange] | undefined {
	const [sourceSpanFileName, sourceSpan] = transformTextSpan(mode, language, serviceScript, sourceScript, textChange.span, filter) ?? [];
	if (sourceSpan && sourceSpanFileName) {
		return [sourceSpanFileName, {
			newText: textChange.newText,
			span: sourceSpan,
		}];
	}
	return undefined;
}

export function transformTextSpan(
	mode: ToSourceMode,
	language: Language<string>,
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	textSpan: ts.TextSpan,
	filter: (data: CodeInformation) => boolean
): [string, ts.TextSpan] | undefined {
	const start = textSpan.start;
	const end = textSpan.start + textSpan.length;
	for (const sourceStart of toSourceOffsets(mode, language, serviceScript, sourceScript, start, filter)) {
		for (const sourceEnd of toSourceOffsets(mode, language, serviceScript, sourceScript, end, filter)) {
			if (
				sourceStart[0] === sourceEnd[0]
				&& sourceEnd[1] >= sourceStart[1]
			) {
				return [sourceStart[0], {
					start: sourceStart[1],
					length: sourceEnd[1] - sourceStart[1],
				}];
			}
		}
	}
}

export function toSourceOffset(
	mode: ToSourceMode,
	language: Language<string>,
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	position: number,
	filter: (data: CodeInformation) => boolean
) {
	for (const source of toSourceOffsets(mode, language, serviceScript, sourceScript, position, filter)) {
		return source;
	}
}

export function* toSourceOffsets(
	mode: ToSourceMode,
	language: Language<string>,
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	position: number,
	filter: (data: CodeInformation) => boolean
): Generator<[fileName: string, offset: number]> {
	if (mode === ToSourceMode.SkipAssciated) {
		const map = language.maps.get(serviceScript.code);
		for (const [sourceOffset, mapping] of map.getSourceOffsets(position - getMappingOffset(serviceScript, sourceScript))) {
			if (filter(mapping.data)) {
				yield [sourceScript.id, sourceOffset];
			}
		}
	}
	else {
		for (const [fileName, _snapshot, map] of language.maps.forEach(serviceScript.code)) {
			for (const [sourceOffset, mapping] of map.getSourceOffsets(position - getMappingOffset(serviceScript, sourceScript))) {
				if (filter(mapping.data)) {
					yield [fileName, sourceOffset];
				}
			}
		}
	}
}

export function toGeneratedOffset(
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	map: SourceMap<CodeInformation>,
	position: number,
	filter: (data: CodeInformation) => boolean
) {
	for (const [generateOffset] of toGeneratedOffsets(serviceScript, sourceScript, map, position, filter)) {
		return generateOffset;
	}
}

export function* toGeneratedOffsets(
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	map: SourceMap<CodeInformation>,
	position: number,
	filter: (data: CodeInformation) => boolean
) {
	for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
		if (filter(mapping.data)) {
			yield [generateOffset + getMappingOffset(serviceScript, sourceScript), mapping] as const;
		}
	}
}

export function getMappingOffset(serviceScript: TypeScriptServiceScript, sourceScript: SourceScript<string>) {
	return !serviceScript.preventLeadingOffset
		? sourceScript.snapshot.getLength()
		: 0;
}
