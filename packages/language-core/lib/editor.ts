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
	feature: SpanMapFeature,
) {
	let mappedStart = map.originalToVirtualPositions(start, feature)[0]?.position;
	let mappedEnd = map.originalToVirtualPositions(end, feature)[0]?.position;

	if (mappedStart === undefined || mappedEnd === undefined) {
		for (const segment of map.segments) {
			if (segment.features & feature) {
				const overlap = getOverlapRange(start, end, segment.originalStart, segment.originalEnd);
				if (overlap) {
					const verbatim = segment.kind === SpanMapKind.Verbatim;
					const curMappedStart = verbatim
						? overlap.start - segment.originalStart + segment.virtualStart
						: segment.virtualStart;
					const curMappedEnd = verbatim
						? Math.min(overlap.end - segment.originalStart + segment.virtualStart, segment.virtualEnd)
						: segment.virtualEnd;

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
