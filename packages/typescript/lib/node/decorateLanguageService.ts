import {
	CodeInformation,
	FileRegistry,
	isCallHierarchyEnabled,
	isCodeActionsEnabled,
	isCompletionEnabled,
	isDefinitionEnabled,
	isFormattingEnabled,
	isHighlightEnabled,
	isHoverEnabled,
	isImplementationEnabled,
	isInlayHintsEnabled,
	isLinkedEditingEnabled,
	isReferencesEnabled,
	isRenameEnabled,
	isSemanticTokensEnabled,
	isTypeDefinitionEnabled,
} from '@volar/language-core';
import type * as ts from 'typescript';
import { dedupeDocumentSpans, dedupeReferencedSymbols } from './dedupe';
import { getVirtualFileAndMap, notEmpty } from './utils';
import { toGeneratedOffset, toSourceOffset, transformCallHierarchyItem, transformDiagnostic, transformDocumentSpan, transformFileTextChanges, transformSpan, transformTextChange, transformTextSpan } from './transform';

export function decorateLanguageService(files: FileRegistry, languageService: ts.LanguageService) {

	// ignored methods

	const {
		getNavigationTree,
		getOutliningSpans,
	} = languageService;

	languageService.getNavigationTree = fileName => {
		const [virtualCode] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			const tree = getNavigationTree(fileName);
			tree.childItems = undefined;
			return tree;
		}
		else {
			return getNavigationTree(fileName);
		}
	};
	languageService.getOutliningSpans = fileName => {
		const [virtualCode] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			return [];
		}
		else {
			return getOutliningSpans(fileName);
		}
	};

	// methods

	const {
		findReferences,
		findRenameLocations,
		getCompletionEntryDetails,
		getCompletionsAtPosition,
		getDefinitionAndBoundSpan,
		getDefinitionAtPosition,
		getFileReferences,
		getFormattingEditsForDocument,
		getFormattingEditsForRange,
		getFormattingEditsAfterKeystroke,
		getImplementationAtPosition,
		getLinkedEditingRangeAtPosition,
		getQuickInfoAtPosition,
		getReferencesAtPosition,
		getSemanticDiagnostics,
		getSyntacticDiagnostics,
		getSuggestionDiagnostics,
		getTypeDefinitionAtPosition,
		getEncodedSemanticClassifications,
		getDocumentHighlights,
		getApplicableRefactors,
		getEditsForFileRename,
		getEditsForRefactor,
		getRenameInfo,
		getCodeFixesAtPosition,
		prepareCallHierarchy,
		provideCallHierarchyIncomingCalls,
		provideCallHierarchyOutgoingCalls,
		provideInlayHints,
		organizeImports,
	} = languageService;

	languageService.getFormattingEditsForDocument = (fileName, options) => {
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			if (!map.mappings.some(mapping => isFormattingEnabled(mapping.data))) {
				return [];
			}
			const edits = getFormattingEditsForDocument(fileName, options);
			return edits
				.map(edit => transformTextChange(sourceFile, map, edit, isFormattingEnabled))
				.filter(notEmpty);
		}
		else {
			return getFormattingEditsForDocument(fileName, options);
		}
	};
	languageService.getFormattingEditsForRange = (fileName, start, end, options) => {
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			const generateStart = toGeneratedOffset(sourceFile, map, start, isFormattingEnabled);
			const generateEnd = toGeneratedOffset(sourceFile, map, end, isFormattingEnabled);
			if (generateStart !== undefined && generateEnd !== undefined) {
				const edits = getFormattingEditsForRange(fileName, generateStart, generateEnd, options);
				return edits
					.map(edit => transformTextChange(sourceFile, map, edit, isFormattingEnabled))
					.filter(notEmpty);
			}
			return [];
		}
		else {
			return getFormattingEditsForRange(fileName, start, end, options);
		}
	};
	languageService.getFormattingEditsAfterKeystroke = (fileName, position, key, options) => {
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			const generatePosition = toGeneratedOffset(sourceFile, map, position, isFormattingEnabled);
			if (generatePosition !== undefined) {
				const edits = getFormattingEditsAfterKeystroke(fileName, generatePosition, key, options);
				return edits
					.map(edit => transformTextChange(sourceFile, map, edit, isFormattingEnabled))
					.filter(notEmpty);
			}
			return [];
		}
		else {
			return getFormattingEditsAfterKeystroke(fileName, position, key, options);
		}
	};
	languageService.getEditsForFileRename = (oldFilePath, newFilePath, formatOptions, preferences) => {
		const edits = getEditsForFileRename(oldFilePath, newFilePath, formatOptions, preferences);
		return edits
			.map(edit => transformFileTextChanges(files, edit, isCodeActionsEnabled))
			.filter(notEmpty);
	};
	languageService.getLinkedEditingRangeAtPosition = (fileName, position) => {
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			const generatePosition = toGeneratedOffset(sourceFile, map, position, isLinkedEditingEnabled);
			if (generatePosition !== undefined) {
				const info = getLinkedEditingRangeAtPosition(fileName, generatePosition);
				if (info) {
					return {
						ranges: info.ranges
							.map(span => transformTextSpan(sourceFile, map, span, isLinkedEditingEnabled))
							.filter(notEmpty),
						wordPattern: info.wordPattern,
					};
				}
			}
		}
		else {
			return getLinkedEditingRangeAtPosition(fileName, position);
		}
	};
	languageService.prepareCallHierarchy = (fileName, position) => {
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			const generatePosition = toGeneratedOffset(sourceFile, map, position, isCallHierarchyEnabled);
			if (generatePosition !== undefined) {
				const item = prepareCallHierarchy(fileName, generatePosition);
				if (Array.isArray(item)) {
					return item.map(item => transformCallHierarchyItem(files, item, isCallHierarchyEnabled));
				}
				else if (item) {
					return transformCallHierarchyItem(files, item, isCallHierarchyEnabled);
				}
			}
		}
		else {
			return prepareCallHierarchy(fileName, position);
		}
	};
	languageService.provideCallHierarchyIncomingCalls = (fileName, position) => {
		let calls: ts.CallHierarchyIncomingCall[] = [];
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			const generatePosition = toGeneratedOffset(sourceFile, map, position, isCallHierarchyEnabled);
			if (generatePosition !== undefined) {
				calls = provideCallHierarchyIncomingCalls(fileName, generatePosition);
			}
		}
		else {
			calls = provideCallHierarchyIncomingCalls(fileName, position);
		}
		return calls
			.map(call => {
				const from = transformCallHierarchyItem(files, call.from, isCallHierarchyEnabled);
				const fromSpans = call.fromSpans
					.map(span => transformSpan(files, call.from.file, span, isCallHierarchyEnabled)?.textSpan)
					.filter(notEmpty);
				return {
					from,
					fromSpans,
				};
			});
	};
	languageService.provideCallHierarchyOutgoingCalls = (fileName, position) => {
		let calls: ts.CallHierarchyOutgoingCall[] = [];
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			const generatePosition = toGeneratedOffset(sourceFile, map, position, isCallHierarchyEnabled);
			if (generatePosition !== undefined) {
				calls = provideCallHierarchyOutgoingCalls(fileName, generatePosition);
			}
		}
		else {
			calls = provideCallHierarchyOutgoingCalls(fileName, position);
		}
		return calls
			.map(call => {
				const to = transformCallHierarchyItem(files, call.to, isCallHierarchyEnabled);
				const fromSpans = call.fromSpans
					.map(span => sourceFile
						? transformTextSpan(sourceFile, map, span, isCallHierarchyEnabled)
						: span
					)
					.filter(notEmpty);
				return {
					to,
					fromSpans,
				};
			});
	};
	languageService.organizeImports = (args, formatOptions, preferences) => {
		const unresolved = organizeImports(args, formatOptions, preferences);
		const resolved = unresolved
			.map(changes => transformFileTextChanges(files, changes, isCodeActionsEnabled))
			.filter(notEmpty);
		return resolved;
	};
	languageService.getQuickInfoAtPosition = (fileName, position) => {
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			const generatePosition = toGeneratedOffset(sourceFile, map, position, isHoverEnabled);
			if (generatePosition !== undefined) {
				const result = getQuickInfoAtPosition(fileName, generatePosition);
				if (result) {
					const textSpan = transformTextSpan(sourceFile, map, result.textSpan, isHoverEnabled);
					if (textSpan) {
						return {
							...result,
							textSpan,
						};
					}
				}
			}
		}
		else {
			return getQuickInfoAtPosition(fileName, position);
		}
	};
	languageService.getDocumentHighlights = (fileName, position, filesToSearch) => {
		const unresolved = linkedCodeFeatureWorker(
			fileName,
			position,
			isHighlightEnabled,
			position => getDocumentHighlights(fileName, position, filesToSearch),
			function* (result) {
				for (const ref of result) {
					for (const reference of ref.highlightSpans) {
						yield [reference.fileName ?? ref.fileName, reference.textSpan.start];
					}
				}
			},
		);
		const resolved = unresolved
			.flat()
			.map(highlights => {
				return {
					...highlights,
					highlightSpans: highlights.highlightSpans
						.map(span => {
							const textSpan = transformSpan(files, span.fileName ?? highlights.fileName, span.textSpan, isHighlightEnabled)?.textSpan;
							if (textSpan) {
								return {
									...span,
									contextSpan: transformSpan(files, span.fileName ?? highlights.fileName, span.contextSpan, isHighlightEnabled)?.textSpan,
									textSpan,
								};
							}
						})
						.filter(notEmpty),
				};
			});
		return resolved;
	};
	languageService.getApplicableRefactors = (fileName, positionOrRange, preferences, triggerReason, kind, includeInteractiveActions) => {
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			const generatePosition = toGeneratedOffset(sourceFile, map, typeof positionOrRange === 'number' ? positionOrRange : positionOrRange.pos, isCodeActionsEnabled);
			if (generatePosition !== undefined) {
				const por = typeof positionOrRange === 'number'
					? generatePosition
					: {
						pos: generatePosition,
						end: generatePosition + positionOrRange.end - positionOrRange.pos,
					};
				return getApplicableRefactors(fileName, por, preferences, triggerReason, kind, includeInteractiveActions);
			}
			return [];
		}
		else {
			return getApplicableRefactors(fileName, positionOrRange, preferences, triggerReason, kind, includeInteractiveActions);
		}
	};
	languageService.getEditsForRefactor = (fileName, formatOptions, positionOrRange, refactorName, actionName, preferences) => {
		let edits: ts.RefactorEditInfo | undefined;
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			const generatePosition = toGeneratedOffset(
				sourceFile,
				map,
				typeof positionOrRange === 'number'
					? positionOrRange
					: positionOrRange.pos,
				isCodeActionsEnabled,
			);
			if (generatePosition !== undefined) {
				const por = typeof positionOrRange === 'number'
					? generatePosition
					: {
						pos: generatePosition,
						end: generatePosition + positionOrRange.end - positionOrRange.pos,
					};
				edits = getEditsForRefactor(fileName, formatOptions, por, refactorName, actionName, preferences);
			}
		}
		else {
			edits = getEditsForRefactor(fileName, formatOptions, positionOrRange, refactorName, actionName, preferences);
		}
		if (edits) {
			edits.edits = edits.edits
				.map(edit => transformFileTextChanges(files, edit, isCodeActionsEnabled))
				.filter(notEmpty);
			return edits;
		}
	};
	languageService.getRenameInfo = (fileName, position, options) => {
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			const generatePosition = toGeneratedOffset(sourceFile, map, position, isRenameEnabled);
			if (generatePosition !== undefined) {
				const info = getRenameInfo(fileName, generatePosition, options);
				if (info.canRename) {
					const span = transformTextSpan(sourceFile, map, info.triggerSpan, isRenameEnabled);
					if (span) {
						info.triggerSpan = span;
						return info;
					}
				}
				else {
					return info;
				}
			}
			return {
				canRename: false,
				localizedErrorMessage: 'Failed to get rename locations',
			};
		}
		else {
			return getRenameInfo(fileName, position, options);
		}
	};
	languageService.getCodeFixesAtPosition = (fileName, start, end, errorCodes, formatOptions, preferences) => {
		let fixes: readonly ts.CodeFixAction[] = [];
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			const generateStart = toGeneratedOffset(sourceFile, map, start, isCodeActionsEnabled);
			const generateEnd = toGeneratedOffset(sourceFile, map, end, isCodeActionsEnabled);
			if (generateStart !== undefined && generateEnd !== undefined) {
				fixes = getCodeFixesAtPosition(
					fileName,
					generateStart,
					generateEnd,
					errorCodes,
					formatOptions,
					preferences,
				);
			}
		}
		else {
			fixes = getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, preferences);
		}
		fixes = fixes.map(fix => {
			fix.changes = fix.changes.map(edit => transformFileTextChanges(files, edit, isCodeActionsEnabled)).filter(notEmpty);
			return fix;
		});
		return fixes;
	};
	languageService.getEncodedSemanticClassifications = (fileName, span, format) => {
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			let start: number | undefined;
			let end: number | undefined;
			for (const mapping of map.mappings) {
				if (isSemanticTokensEnabled(mapping.data) && mapping.sourceOffsets[0] >= span.start && mapping.sourceOffsets[0] <= span.start + span.length) {
					start ??= mapping.generatedOffsets[0];
					end ??= mapping.generatedOffsets[mapping.generatedOffsets.length - 1];
					start = Math.min(start, mapping.generatedOffsets[0]);
					end = Math.max(end, mapping.generatedOffsets[mapping.generatedOffsets.length - 1]);
				}
			}
			if (start === undefined || end === undefined) {
				start = 0;
				end = 0;
			}
			start += sourceFile.snapshot.getLength();
			end += sourceFile.snapshot.getLength();
			const result = getEncodedSemanticClassifications(fileName, { start, length: end - start }, format);
			const spans: number[] = [];
			for (let i = 0; i < result.spans.length; i += 3) {
				const sourceStart = toSourceOffset(sourceFile, map, result.spans[i], isSemanticTokensEnabled);
				const sourceEnd = toSourceOffset(sourceFile, map, result.spans[i] + result.spans[i + 1], isSemanticTokensEnabled);
				if (sourceStart !== undefined && sourceEnd !== undefined) {
					spans.push(
						sourceStart,
						sourceEnd - sourceStart,
						result.spans[i + 2]
					);
				}
			}
			result.spans = spans;
			return result;
		}
		else {
			return getEncodedSemanticClassifications(fileName, span, format);
		}
	};
	languageService.getSyntacticDiagnostics = fileName => {
		return getSyntacticDiagnostics(fileName)
			.map(d => transformDiagnostic(files, d))
			.filter(notEmpty);
	};
	languageService.getSemanticDiagnostics = fileName => {
		return getSemanticDiagnostics(fileName)
			.map(d => transformDiagnostic(files, d))
			.filter(notEmpty);
	};
	languageService.getSuggestionDiagnostics = fileName => {
		return getSuggestionDiagnostics(fileName)
			.map(d => transformDiagnostic(files, d))
			.filter(notEmpty);
	};
	languageService.getDefinitionAndBoundSpan = (fileName, position) => {
		const unresolved = linkedCodeFeatureWorker(
			fileName,
			position,
			isDefinitionEnabled,
			position => getDefinitionAndBoundSpan(fileName, position),
			function* (result) {
				for (const ref of result.definitions ?? []) {
					yield [ref.fileName, ref.textSpan.start];
				}
			},
		);
		const textSpan = unresolved
			.map(s => transformSpan(files, fileName, s.textSpan, isDefinitionEnabled)?.textSpan)
			.filter(notEmpty)[0];
		if (!textSpan) {
			return;
		}
		const definitions = unresolved
			.map(s => s.definitions
				?.map(s => transformDocumentSpan(files, s, isDefinitionEnabled, s.fileName !== fileName))
				.filter(notEmpty)
			)
			.filter(notEmpty)
			.flat();
		return {
			textSpan,
			definitions: dedupeDocumentSpans(definitions),
		};
	};
	languageService.findReferences = (fileName, position) => {
		const unresolved = linkedCodeFeatureWorker(
			fileName,
			position,
			isReferencesEnabled,
			position => findReferences(fileName, position),
			function* (result) {
				for (const ref of result) {
					for (const reference of ref.references) {
						yield [reference.fileName, reference.textSpan.start];
					}
				}
			},
		);
		const resolved = unresolved
			.flat()
			.map(symbol => {
				const definition = transformDocumentSpan(files, symbol.definition, isDefinitionEnabled);
				if (definition) {
					return {
						definition,
						references: symbol.references
							.map(r => transformDocumentSpan(files, r, isReferencesEnabled))
							.filter(notEmpty),
					};
				}
			})
			.filter(notEmpty);
		return dedupeReferencedSymbols(resolved);
	};
	languageService.getDefinitionAtPosition = (fileName, position) => {
		const unresolved = linkedCodeFeatureWorker(
			fileName,
			position,
			isDefinitionEnabled,
			position => getDefinitionAtPosition(fileName, position),
			function* (result) {
				for (const ref of result) {
					yield [ref.fileName, ref.textSpan.start];
				}
			},
		);
		const resolved = unresolved
			.flat()
			.map(s => transformDocumentSpan(files, s, isDefinitionEnabled, s.fileName !== fileName))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};
	languageService.getTypeDefinitionAtPosition = (fileName, position) => {
		const unresolved = linkedCodeFeatureWorker(
			fileName,
			position,
			isTypeDefinitionEnabled,
			position => getTypeDefinitionAtPosition(fileName, position),
			function* (result) {
				for (const ref of result) {
					yield [ref.fileName, ref.textSpan.start];
				}
			},
		);
		const resolved = unresolved
			.flat()
			.map(s => transformDocumentSpan(files, s, isTypeDefinitionEnabled))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};
	languageService.getImplementationAtPosition = (fileName, position) => {
		const unresolved = linkedCodeFeatureWorker(
			fileName,
			position,
			isImplementationEnabled,
			position => getImplementationAtPosition(fileName, position),
			function* (result) {
				for (const ref of result) {
					yield [ref.fileName, ref.textSpan.start];
				}
			},
		);
		const resolved = unresolved
			.flat()
			.map(s => transformDocumentSpan(files, s, isImplementationEnabled))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};
	languageService.findRenameLocations = (fileName, position, findInStrings, findInComments, preferences) => {
		const unresolved = linkedCodeFeatureWorker(
			fileName,
			position,
			isRenameEnabled,
			position => findRenameLocations(fileName, position, findInStrings, findInComments, preferences as ts.UserPreferences),
			function* (result) {
				for (const ref of result) {
					yield [ref.fileName, ref.textSpan.start];
				}
			},
		);
		const resolved = unresolved
			.flat()
			.map(s => transformDocumentSpan(files, s, isRenameEnabled))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};
	languageService.getReferencesAtPosition = (fileName, position) => {
		const unresolved = linkedCodeFeatureWorker(
			fileName,
			position,
			isReferencesEnabled,
			position => getReferencesAtPosition(fileName, position),
			function* (result) {
				for (const ref of result) {
					yield [ref.fileName, ref.textSpan.start];
				}
			},
		);
		const resolved = unresolved
			.flat()
			.map(s => transformDocumentSpan(files, s, isReferencesEnabled))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};
	languageService.getCompletionsAtPosition = (fileName, position, options, formattingSettings) => {
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			let mainResult: ts.CompletionInfo | undefined;
			let additionalResults: ts.CompletionInfo[] = [];
			let isAdditional: boolean | undefined;
			const generatedOffset = toGeneratedOffset(sourceFile, map, position, data => {
				if (!isCompletionEnabled(data)) {
					return false;
				}
				isAdditional = typeof data.completion === 'object' && data.completion.isAdditional;
				if (!isAdditional && mainResult) {
					return false;
				}
				return true;
			});
			if (generatedOffset !== undefined) {
				const result = getCompletionsAtPosition(fileName, generatedOffset, options, formattingSettings);
				if (result) {
					for (const entry of result.entries) {
						entry.replacementSpan = entry.replacementSpan && transformTextSpan(sourceFile, map, entry.replacementSpan, isCompletionEnabled);
					}
					result.optionalReplacementSpan = result.optionalReplacementSpan && transformTextSpan(sourceFile, map, result.optionalReplacementSpan, isCompletionEnabled);
					if (isAdditional) {
						additionalResults.push(result);
					}
					else {
						mainResult = result;
					}
				}
			}
			if (!mainResult && additionalResults.length) {
				mainResult = additionalResults.shift();
			}
			if (mainResult) {
				return {
					...mainResult,
					entries: [
						...mainResult.entries,
						...additionalResults.map(additionalResult => additionalResult.entries).flat(),
					],
				};
			}
		}
		else {
			return getCompletionsAtPosition(fileName, position, options, formattingSettings);
		}
	};
	languageService.getCompletionEntryDetails = (fileName, position, entryName, formatOptions, source, preferences, data) => {

		let details: ts.CompletionEntryDetails | undefined;

		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			const generatePosition = toGeneratedOffset(sourceFile, map, position, isCompletionEnabled);
			if (generatePosition !== undefined) {
				details = getCompletionEntryDetails(fileName, generatePosition, entryName, formatOptions, source, preferences, data);
			}
		}
		else {
			return getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data);
		}

		if (details?.codeActions) {
			for (const codeAction of details.codeActions) {
				codeAction.changes = codeAction.changes.map(edit => transformFileTextChanges(files, edit, isCompletionEnabled)).filter(notEmpty);
			}
		}

		return details;
	};
	languageService.provideInlayHints = (fileName, span, preferences) => {
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			let start: number | undefined;
			let end: number | undefined;
			for (const mapping of map.mappings) {
				if (isInlayHintsEnabled(mapping.data) && mapping.sourceOffsets[0] >= span.start && mapping.sourceOffsets[0] <= span.start + span.length) {
					start ??= mapping.generatedOffsets[0];
					end ??= mapping.generatedOffsets[mapping.generatedOffsets.length - 1];
					start = Math.min(start, mapping.generatedOffsets[0]);
					end = Math.max(end, mapping.generatedOffsets[mapping.generatedOffsets.length - 1]);
				}
			}
			if (start === undefined || end === undefined) {
				start = 0;
				end = 0;
			}
			start += sourceFile.snapshot.getLength();
			end += sourceFile.snapshot.getLength();
			const result = provideInlayHints(fileName, { start, length: end - start }, preferences);
			const hints: ts.InlayHint[] = [];
			for (const hint of result) {
				const sourcePosition = toSourceOffset(sourceFile, map, hint.position, isInlayHintsEnabled);
				if (sourcePosition !== undefined) {
					hints.push({
						...hint,
						position: sourcePosition,
					});
				}
			}
			return hints;
		}
		else {
			return provideInlayHints(fileName, span, preferences);
		}
	};
	languageService.getFileReferences = fileName => {
		const unresolved = getFileReferences(fileName);
		const resolved = unresolved
			.map(s => transformDocumentSpan(files, s, isReferencesEnabled))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};

	function linkedCodeFeatureWorker<T>(
		fileName: string,
		position: number,
		filter: (data: CodeInformation) => boolean,
		worker: (position: number) => T | undefined,
		getLinkedCodes: (result: T) => Generator<[fileName: string, position: number]>,
	) {

		let results: T[] = [];

		const processedFilePositions = new Set<string>();
		const [virtualCode, sourceFile, map] = getVirtualFileAndMap(files, fileName);
		if (virtualCode) {
			for (const [generatedOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (filter(mapping.data)) {
					process(fileName, generatedOffset + sourceFile.snapshot.getLength());
				}
			}
		}
		else {
			process(fileName, position);
		}

		return results;

		function process(fileName: string, position: number) {
			if (processedFilePositions.has(fileName + ':' + position)) {
				return;
			}
			processedFilePositions.add(fileName + ':' + position);
			const result = worker(position);
			if (!result) {
				return;
			}
			results = results.concat(result);
			for (const ref of getLinkedCodes(result)) {

				processedFilePositions.add(ref[0] + ':' + ref[1]);

				const [virtualFile, sourceFile] = getVirtualFileAndMap(files, ref[0]);
				if (!virtualFile) {
					continue;
				}

				const linkedCodeMap = files.getLinkedCodeMap(virtualFile.code);
				if (!linkedCodeMap) {
					continue;
				}

				for (const linkedCodeOffset of linkedCodeMap.getLinkedOffsets(ref[1] - sourceFile.snapshot.getLength())) {
					process(ref[0], linkedCodeOffset + sourceFile.snapshot.getLength());
				}
			}
		}
	}
}
