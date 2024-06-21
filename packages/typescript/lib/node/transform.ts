import type { CodeInformation, SourceScript, TypeScriptServiceScript } from '@volar/language-core';
import { Language, shouldReportDiagnostics } from '@volar/language-core';
import type * as ts from 'typescript';
import { getServiceScript } from './utils';
import type { TextChange } from "typescript";

const transformedDiagnostics = new WeakMap<ts.Diagnostic, ts.Diagnostic | undefined>();
const transformedSourceFile = new WeakSet<ts.SourceFile>();

export function transformCallHierarchyItem(
	language: Language<string>,
	item: ts.CallHierarchyItem,
	filter: (data: CodeInformation) => boolean
): ts.CallHierarchyItem {
	const span = transformSpan(language, item.file, item.span, filter);
	const selectionSpan = transformSpan(language, item.file, item.selectionSpan, filter);
	return {
		...item,
		file: span?.fileName ?? item.file,
		span: span?.textSpan ?? { start: 0, length: 0 },
		selectionSpan: selectionSpan?.textSpan ?? { start: 0, length: 0 },
	};
}

export function transformDiagnostic<T extends ts.Diagnostic>(
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
				.map(d => transformDiagnostic(language, d, program, isTsc))
				.filter(d => !!d);
		}

		if (
			diagnostic.file !== undefined
			&& diagnostic.start !== undefined
			&& diagnostic.length !== undefined
		) {
			const [serviceScript] = getServiceScript(language, diagnostic.file.fileName);
			if (serviceScript) {
				const [sourceSpanFileName, sourceSpan] = transformTextSpan(undefined, language, serviceScript, {
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
	const [serviceScript] = getServiceScript(language, sourceFile.fileName);
	if (serviceScript && !serviceScript.preventLeadingOffset) {
		const sourceScript = language.scripts.fromVirtualCode(serviceScript.code);
		sourceFile.text = sourceScript.snapshot.getText(0, sourceScript.snapshot.getLength())
			+ sourceFile.text.substring(sourceScript.snapshot.getLength());
	}
}

export function transformFileTextChanges(
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
				const { fileName, textSpan } = transformSpan(language, fileChanges.fileName, c.span, filter) ?? {};
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
	language: Language<string>,
	documentSpan: T,
	filter: (data: CodeInformation) => boolean,
	shouldFallback?: boolean
): T | undefined {
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
	const [serviceScript] = getServiceScript(language, fileName);
	if (serviceScript) {
		const [sourceSpanFileName, sourceSpan] = transformTextSpan(undefined, language, serviceScript, textSpan, filter) ?? [];
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
	sourceScript: SourceScript<string> | undefined,
	language: Language<string>,
	serviceScript: TypeScriptServiceScript,
	textChange: ts.TextChange,
	filter: (data: CodeInformation) => boolean
): [string, ts.TextChange] | undefined {
	const [sourceSpanFileName, sourceSpan] = transformTextSpan(sourceScript, language, serviceScript, textChange.span, filter) ?? [];
	if (sourceSpan && sourceSpanFileName) {
		return [sourceSpanFileName, {
			newText: textChange.newText,
			span: sourceSpan,
		}];
	}
	return undefined;
}

export function transformTextSpan(
	sourceScript: SourceScript<string> | undefined,
	language: Language<string>,
	serviceScript: TypeScriptServiceScript,
	textSpan: ts.TextSpan,
	filter: (data: CodeInformation) => boolean
): [string, ts.TextSpan] | undefined {
	const start = textSpan.start;
	const end = textSpan.start + textSpan.length;
	for (const [fileName, sourceStart, sourceEnd] of toSourceRanges(sourceScript, language, serviceScript, start, end, filter)) {
		return [fileName, {
			start: sourceStart,
			length: sourceEnd - sourceStart,
		}];
	}
}

export function toSourceOffset(
	sourceScript: SourceScript<string> | undefined,
	language: Language<string>,
	serviceScript: TypeScriptServiceScript,
	position: number,
	filter: (data: CodeInformation) => boolean
) {
	for (const source of toSourceOffsets(sourceScript, language, serviceScript, position, filter)) {
		return source;
	}
}

export function* toSourceRanges(
	sourceScript: SourceScript<string> | undefined,
	language: Language<string>,
	serviceScript: TypeScriptServiceScript,
	start: number,
	end: number,
	filter: (data: CodeInformation) => boolean
): Generator<[fileName: string, start: number, end: number]> {
	if (sourceScript) {
		const map = language.maps.get(serviceScript.code, sourceScript);
		let mapped = false;
		for (const [sourceStart, sourceEnd, mapping] of map.getSourceStartEnd(start - getMappingOffset(language, serviceScript), end - getMappingOffset(language, serviceScript))) {
			if (filter(mapping.data)) {
				mapped = true;
				yield [sourceScript.id, sourceStart, sourceEnd];
			}
		}
		if (!mapped) {
			// fallback
			for (const sourceStart of toSourceOffsets(sourceScript, language, serviceScript, start, filter)) {
				for (const sourceEnd of toSourceOffsets(sourceScript, language, serviceScript, end, filter)) {
					if (
						sourceStart[0] === sourceEnd[0]
						&& sourceEnd[1] >= sourceStart[1]
					) {
						yield [sourceStart[0], sourceStart[1], sourceEnd[1]];
						break;
					}
				}
			}
		}
	}
	else {
		for (const [fileName, _snapshot, map] of language.maps.forEach(serviceScript.code)) {
			for (const [sourceStart, sourceEnd, mapping] of map.getSourceStartEnd(start - getMappingOffset(language, serviceScript), end - getMappingOffset(language, serviceScript))) {
				if (filter(mapping.data)) {
					yield [fileName, sourceStart, sourceEnd];
				}
			}
		}
	}
}

export function* toSourceOffsets(
	sourceScript: SourceScript<string> | undefined,
	language: Language<string>,
	serviceScript: TypeScriptServiceScript,
	position: number,
	filter: (data: CodeInformation) => boolean
): Generator<[fileName: string, offset: number]> {
	if (sourceScript) {
		const map = language.maps.get(serviceScript.code, sourceScript);
		for (const [sourceOffset, mapping] of map.getSourceOffsets(position - getMappingOffset(language, serviceScript))) {
			if (filter(mapping.data)) {
				yield [sourceScript.id, sourceOffset];
			}
		}
	}
	else {
		for (const [fileName, _snapshot, map] of language.maps.forEach(serviceScript.code)) {
			for (const [sourceOffset, mapping] of map.getSourceOffsets(position - getMappingOffset(language, serviceScript))) {
				if (filter(mapping.data)) {
					yield [fileName, sourceOffset];
				}
			}
		}
	}
}

export function* toGeneratedRanges(
	language: Language,
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	start: number,
	end: number,
	filter: (data: CodeInformation) => boolean
) {
	const map = language.maps.get(serviceScript.code, sourceScript);
	let mapped = false;
	for (const [generateStart, generateEnd, mapping] of map.getGeneratedStartEnd(start, end)) {
		if (filter(mapping.data)) {
			mapped = true;
			yield [
				generateStart + getMappingOffset(language, serviceScript),
				generateEnd + getMappingOffset(language, serviceScript),
			] as const;
		}
	}
	if (!mapped) {
		// fallback
		for (const [generatedStart] of toGeneratedOffsets(language, serviceScript, sourceScript, start, filter)) {
			for (const [generatedEnd] of toGeneratedOffsets(language, serviceScript, sourceScript, end, filter)) {
				if (generatedEnd >= generatedStart) {
					yield [generatedStart, generatedEnd] as const;
					break;
				}
			}
		}
	}
}

export function toGeneratedOffset(
	language: Language,
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	position: number,
	filter: (data: CodeInformation) => boolean
) {
	for (const [generateOffset] of toGeneratedOffsets(language, serviceScript, sourceScript, position, filter)) {
		return generateOffset;
	}
}

export function* toGeneratedOffsets(
	language: Language,
	serviceScript: TypeScriptServiceScript,
	sourceScript: SourceScript<string>,
	position: number,
	filter: (data: CodeInformation) => boolean
) {
	const map = language.maps.get(serviceScript.code, sourceScript);
	for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
		if (filter(mapping.data)) {
			yield [generateOffset + getMappingOffset(language, serviceScript), mapping] as const;
		}
	}
}

export function getMappingOffset(language: Language, serviceScript: TypeScriptServiceScript) {
	if (serviceScript.preventLeadingOffset) {
		return 0;
	}
	const sourceScript = language.scripts.fromVirtualCode(serviceScript.code);
	return sourceScript.snapshot.getLength();
}
