import { SpanMapFeature, SpanMapKind } from '@volar/source-map';
import type { Mapper } from './types';

export function isHoverEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.Hover);
}

export function isInlayHintsEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.InlayHints);
}

export function isCodeLensEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.CodeLens);
}

export function isMonikerEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.References);
}

export function isInlineValueEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.Hover);
}

export function isSemanticTokensEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.SemanticTokens);
}

export function isCallHierarchyEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.CallHierarchy);
}

export function isTypeHierarchyEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.CallHierarchy);
}

export function isRenameEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.Rename);
}

export function isDefinitionEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.Definition);
}

export function isTypeDefinitionEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.TypeDefinition);
}

export function isReferencesEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.References);
}

export function isImplementationEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.Implementation);
}

export function isHighlightEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.DocumentHighlights);
}

export function isSymbolsEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.DocumentSymbols);
}

export function isFoldingRangesEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.FoldingRanges);
}

export function isSelectionRangesEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.SelectionRanges);
}

export function isLinkedEditingEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.LinkedEditing);
}

export function isColorEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.DocumentSymbols);
}

export function isDocumentLinkEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.DocumentSymbols);
}

export function isCodeActionsEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.CodeActions);
}

export function isFormattingEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.Formatting);
}

export function isCompletionEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.Completion);
}

export function isAutoInsertEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.AutoInsert);
}

export function isSignatureHelpEnabled(features: number): boolean {
	return !!(features & SpanMapFeature.SignatureHelp);
}

export function findOverlapCodeRange(
	start: number,
	end: number,
	map: Mapper,
	filter: (features: number) => boolean,
) {
	let mappedStart: number | undefined;
	let mappedEnd: number | undefined;

	for (const [mapped, mapping] of map.toGeneratedLocation(start)) {
		if (filter(mapping[5])) {
			mappedStart = mapped;
			break;
		}
	}
	for (const [mapped, mapping] of map.toGeneratedLocation(end)) {
		if (filter(mapping[5])) {
			mappedEnd = mapped;
			break;
		}
	}

	if (mappedStart === undefined || mappedEnd === undefined) {
		for (const [generatedStart, generatedLength, sourceStart, sourceLength, kind, features] of map.mappings) {
			if (filter(features)) {
				const overlap = getOverlapRange(start, end, sourceStart, sourceStart + sourceLength);
				if (overlap) {
					const verbatim = kind === SpanMapKind.Verbatim;
					const curMappedStart = verbatim ? (overlap.start - sourceStart) + generatedStart : generatedStart;
					const curMappedEnd = generatedStart
						+ (verbatim ? Math.min(overlap.end - sourceStart, generatedLength) : generatedLength);

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
