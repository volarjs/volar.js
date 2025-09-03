import type { CodeInformation, Mapper } from './types';

export function isHoverEnabled(info: CodeInformation): boolean {
	return !!info.semantic;
}

export function isInlayHintsEnabled(info: CodeInformation): boolean {
	return !!info.semantic;
}

export function isCodeLensEnabled(info: CodeInformation): boolean {
	return !!info.semantic;
}

export function isMonikerEnabled(info: CodeInformation): boolean {
	return !!info.semantic;
}

export function isInlineValueEnabled(info: CodeInformation): boolean {
	return !!info.semantic;
}

export function isSemanticTokensEnabled(info: CodeInformation): boolean {
	return typeof info.semantic === 'object'
		? info.semantic.shouldHighlight?.() ?? true
		: !!info.semantic;
}

export function isCallHierarchyEnabled(info: CodeInformation): boolean {
	return !!info.navigation;
}

export function isTypeHierarchyEnabled(info: CodeInformation): boolean {
	return !!info.navigation;
}

export function isRenameEnabled(info: CodeInformation): boolean {
	return typeof info.navigation === 'object'
		? info.navigation.shouldRename?.() ?? true
		: !!info.navigation;
}

export function isDefinitionEnabled(info: CodeInformation): boolean {
	return !!info.navigation;
}

export function isTypeDefinitionEnabled(info: CodeInformation): boolean {
	return !!info.navigation;
}

export function isReferencesEnabled(info: CodeInformation): boolean {
	return !!info.navigation;
}

export function isImplementationEnabled(info: CodeInformation): boolean {
	return !!info.navigation;
}

export function isHighlightEnabled(info: CodeInformation): boolean {
	return typeof info.navigation === 'object'
		? info.navigation.shouldHighlight?.() ?? true
		: !!info.navigation;
}

export function isSymbolsEnabled(info: CodeInformation): boolean {
	return !!info.structure;
}

export function isFoldingRangesEnabled(info: CodeInformation): boolean {
	return !!info.structure;
}

export function isSelectionRangesEnabled(info: CodeInformation): boolean {
	return !!info.structure;
}

export function isLinkedEditingEnabled(info: CodeInformation): boolean {
	return !!info.structure;
}

export function isColorEnabled(info: CodeInformation): boolean {
	return !!info.structure;
}

export function isDocumentLinkEnabled(info: CodeInformation): boolean {
	return !!info.structure;
}

export function isDiagnosticsEnabled(info: CodeInformation): boolean {
	return !!info.verification;
}

export function isCodeActionsEnabled(info: CodeInformation): boolean {
	return !!info.verification;
}

export function isFormattingEnabled(info: CodeInformation): boolean {
	return !!info.format;
}

export function isCompletionEnabled(info: CodeInformation): boolean {
	return !!info.completion;
}

export function isAutoInsertEnabled(info: CodeInformation): boolean {
	return !!info.completion;
}

export function isSignatureHelpEnabled(info: CodeInformation): boolean {
	return !!info.completion;
}

// should...

export function shouldReportDiagnostics(
	info: CodeInformation,
	source: string | undefined,
	code: string | number | undefined,
): boolean {
	return typeof info.verification === 'object'
		? info.verification.shouldReport?.(source, code) ?? true
		: !!info.verification;
}

//  resolve...

export function resolveRenameNewName(newName: string, info: CodeInformation): string {
	return typeof info.navigation === 'object'
		? info.navigation.resolveRenameNewName?.(newName) ?? newName
		: newName;
}

export function resolveRenameEditText(text: string, info: CodeInformation): string {
	return typeof info.navigation === 'object'
		? info.navigation.resolveRenameEditText?.(text) ?? text
		: text;
}

export function findOverlapCodeRange(
	start: number,
	end: number,
	map: Mapper,
	filter: (data: CodeInformation) => boolean,
) {
	let mappedStart: number | undefined;
	let mappedEnd: number | undefined;

	for (const [mapped, mapping] of map.toGeneratedLocation(start)) {
		if (filter(mapping.data)) {
			mappedStart = mapped;
			break;
		}
	}
	for (const [mapped, mapping] of map.toGeneratedLocation(end)) {
		if (filter(mapping.data)) {
			mappedEnd = mapped;
			break;
		}
	}

	if (mappedStart === undefined || mappedEnd === undefined) {
		for (const mapping of map.mappings) {
			if (filter(mapping.data)) {
				const mappingStart = mapping.sourceOffsets[0];
				const mappingEnd = mapping.sourceOffsets[mapping.sourceOffsets.length - 1]
					+ mapping.lengths[mapping.lengths.length - 1];
				const overlap = getOverlapRange(start, end, mappingStart, mappingEnd);
				if (overlap) {
					const curMappedStart = (overlap.start - mappingStart) + mapping.generatedOffsets[0];
					const lastGeneratedLength =
						(mapping.generatedLengths ?? mapping.lengths)[mapping.generatedOffsets.length - 1];
					const curMappedEndOffset = Math.min(
						overlap.end - mapping.sourceOffsets[mapping.sourceOffsets.length - 1],
						lastGeneratedLength,
					);
					const curMappedEnd = mapping.generatedOffsets[mapping.generatedOffsets.length - 1] + curMappedEndOffset;

					mappedStart = mappedStart === undefined ? curMappedStart : Math.min(mappedStart, curMappedStart);
					mappedEnd = mappedEnd === undefined ? curMappedEnd : Math.max(mappedEnd, curMappedEnd);
				}
			}
		}
	}

	if (mappedStart !== undefined && mappedEnd !== undefined) {
		return {
			start: mappedStart,
			end: mappedEnd,
		};
	}
}

function getOverlapRange(
	range1Start: number,
	range1End: number,
	range2Start: number,
	range2End: number,
): { start: number; end: number } | undefined {
	const start = Math.max(range1Start, range2Start);
	const end = Math.min(range1End, range2End);

	if (start > end) {
		return undefined;
	}

	return {
		start,
		end,
	};
}
