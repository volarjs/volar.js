import {
	CodeInformation,
	Language,
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
	isSignatureHelpEnabled,
	isTypeDefinitionEnabled,
} from '@volar/language-core';
import type * as ts from 'typescript';
import { dedupeDocumentSpans } from './dedupe';
import { getServiceScript, notEmpty } from './utils';
import { toGeneratedOffsets, toGeneratedOffset, toSourceOffset, transformCallHierarchyItem, transformDiagnostic, transformDocumentSpan, transformFileTextChanges, transformSpan, transformTextChange, transformTextSpan } from './transform';

const windowsPathReg = /\\/g;

export function decorateLanguageService(
	language: Language,
	languageService: ts.LanguageService,
) {

	// ignored methods

	const {
		getNavigationTree,
		getOutliningSpans,
	} = languageService;

	languageService.getNavigationTree = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript] = getServiceScript(language, fileName);
		if (serviceScript) {
			const tree = getNavigationTree(fileName);
			tree.childItems = undefined;
			return tree;
		}
		else {
			return getNavigationTree(fileName);
		}
	};
	languageService.getOutliningSpans = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript] = getServiceScript(language, fileName);
		if (serviceScript) {
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
		getSignatureHelpItems,
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

	languageService.getFormattingEditsForDocument = (filePath, options) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			if (!map.mappings.some(mapping => isFormattingEnabled(mapping.data))) {
				return [];
			}
			const edits = getFormattingEditsForDocument(fileName, options);
			return edits
				.map(edit => transformTextChange(sourceScript, map, edit, isFormattingEnabled))
				.filter(notEmpty);
		}
		else {
			return getFormattingEditsForDocument(fileName, options);
		}
	};
	languageService.getFormattingEditsForRange = (filePath, start, end, options) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			const generateStart = toGeneratedOffset(sourceScript, map, start, isFormattingEnabled);
			const generateEnd = toGeneratedOffset(sourceScript, map, end, isFormattingEnabled);
			if (generateStart !== undefined && generateEnd !== undefined) {
				const edits = getFormattingEditsForRange(fileName, generateStart, generateEnd, options);
				return edits
					.map(edit => transformTextChange(sourceScript, map, edit, isFormattingEnabled))
					.filter(notEmpty);
			}
			return [];
		}
		else {
			return getFormattingEditsForRange(fileName, start, end, options);
		}
	};
	languageService.getFormattingEditsAfterKeystroke = (filePath, position, key, options) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(sourceScript, map, position, isFormattingEnabled);
			if (generatePosition !== undefined) {
				const edits = getFormattingEditsAfterKeystroke(fileName, generatePosition, key, options);
				return edits
					.map(edit => transformTextChange(sourceScript, map, edit, isFormattingEnabled))
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
			.map(edit => transformFileTextChanges(language, edit, isRenameEnabled))
			.filter(notEmpty);
	};
	languageService.getLinkedEditingRangeAtPosition = (filePath, position) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(sourceScript, map, position, isLinkedEditingEnabled);
			if (generatePosition !== undefined) {
				const info = getLinkedEditingRangeAtPosition(fileName, generatePosition);
				if (info) {
					return {
						ranges: info.ranges
							.map(span => transformTextSpan(sourceScript, map, span, isLinkedEditingEnabled))
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
	languageService.prepareCallHierarchy = (filePath, position) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(sourceScript, map, position, isCallHierarchyEnabled);
			if (generatePosition !== undefined) {
				const item = prepareCallHierarchy(fileName, generatePosition);
				if (Array.isArray(item)) {
					return item.map(item => transformCallHierarchyItem(language, item, isCallHierarchyEnabled));
				}
				else if (item) {
					return transformCallHierarchyItem(language, item, isCallHierarchyEnabled);
				}
			}
		}
		else {
			return prepareCallHierarchy(fileName, position);
		}
	};
	languageService.provideCallHierarchyIncomingCalls = (filePath, position) => {
		let calls: ts.CallHierarchyIncomingCall[] = [];
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(sourceScript, map, position, isCallHierarchyEnabled);
			if (generatePosition !== undefined) {
				calls = provideCallHierarchyIncomingCalls(fileName, generatePosition);
			}
		}
		else {
			calls = provideCallHierarchyIncomingCalls(fileName, position);
		}
		return calls
			.map(call => {
				const from = transformCallHierarchyItem(language, call.from, isCallHierarchyEnabled);
				const fromSpans = call.fromSpans
					.map(span => transformSpan(language, call.from.file, span, isCallHierarchyEnabled)?.textSpan)
					.filter(notEmpty);
				return {
					from,
					fromSpans,
				};
			});
	};
	languageService.provideCallHierarchyOutgoingCalls = (filePath, position) => {
		let calls: ts.CallHierarchyOutgoingCall[] = [];
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(sourceScript, map, position, isCallHierarchyEnabled);
			if (generatePosition !== undefined) {
				calls = provideCallHierarchyOutgoingCalls(fileName, generatePosition);
			}
		}
		else {
			calls = provideCallHierarchyOutgoingCalls(fileName, position);
		}
		return calls
			.map(call => {
				const to = transformCallHierarchyItem(language, call.to, isCallHierarchyEnabled);
				const fromSpans = call.fromSpans
					.map(span => sourceScript
						? transformTextSpan(sourceScript, map, span, isCallHierarchyEnabled)
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
			.map(changes => transformFileTextChanges(language, changes, isCodeActionsEnabled))
			.filter(notEmpty);
		return resolved;
	};
	languageService.getQuickInfoAtPosition = (filePath, position) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			const infos: ts.QuickInfo[] = [];
			for (const [generatePosition, mapping] of toGeneratedOffsets(sourceScript, map, position)) {
				if (!isHoverEnabled(mapping.data)) {
					continue;
				}
				const info = getQuickInfoAtPosition(fileName, generatePosition);
				if (info) {
					const textSpan = transformTextSpan(sourceScript, map, info.textSpan, isHoverEnabled);
					if (textSpan) {
						infos.push({
							...info,
							textSpan,
						});
					}
				}
			}
			if (infos.length === 1) {
				return infos[0];
			}
			else if (infos.length >= 2) {
				const combine = { ...infos[0] };
				combine.displayParts = combine.displayParts?.slice();
				combine.documentation = combine.documentation?.slice();
				combine.tags = combine.tags?.slice();
				const displayPartsStrs = new Set([displayPartsToString(infos[0].displayParts)]);
				const documentationStrs = new Set([displayPartsToString(infos[0].documentation)]);
				const tagsStrs = new Set<string>();
				for (const tag of infos[0].tags ?? []) {
					tagsStrs.add(tag.name + '__volar__' + displayPartsToString(tag.text));
				}
				for (let i = 1; i < infos.length; i++) {
					const { displayParts, documentation, tags } = infos[i];
					if (displayParts?.length && !displayPartsStrs.has(displayPartsToString(displayParts))) {
						displayPartsStrs.add(displayPartsToString(displayParts));
						combine.displayParts ??= [];
						combine.displayParts.push({ ...displayParts[0], text: '\n\n' + displayParts[0].text });
						combine.displayParts.push(...displayParts.slice(1));
					}
					if (documentation?.length && !documentationStrs.has(displayPartsToString(documentation))) {
						documentationStrs.add(displayPartsToString(documentation));
						combine.documentation ??= [];
						combine.documentation.push({ ...documentation[0], text: '\n\n' + documentation[0].text });
						combine.documentation.push(...documentation.slice(1));
					}
					for (const tag of tags ?? []) {
						if (!tagsStrs.has(tag.name + '__volar__' + displayPartsToString(tag.text))) {
							tagsStrs.add(tag.name + '__volar__' + displayPartsToString(tag.text));
							combine.tags ??= [];
							combine.tags.push(tag);
						}
					}
				}
				return combine;
			}
		}
		else {
			return getQuickInfoAtPosition(fileName, position);
		}
	};
	languageService.getSignatureHelpItems = (filePath, position, options) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(sourceScript, map, position, isSignatureHelpEnabled);
			if (generatePosition !== undefined) {
				const result = getSignatureHelpItems(fileName, generatePosition, options);
				if (result) {
					const applicableSpan = transformTextSpan(sourceScript, map, result.applicableSpan, isSignatureHelpEnabled);
					if (applicableSpan) {
						return {
							...result,
							applicableSpan,
						};
					}
				}
			}
		}
		else {
			return getSignatureHelpItems(fileName, position, options);
		}
	};
	languageService.getDocumentHighlights = (filePath, position, filesToSearch) => {
		const fileName = filePath.replace(windowsPathReg, '/');
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
							const textSpan = transformSpan(language, span.fileName ?? highlights.fileName, span.textSpan, isHighlightEnabled)?.textSpan;
							if (textSpan) {
								return {
									...span,
									contextSpan: transformSpan(language, span.fileName ?? highlights.fileName, span.contextSpan, isHighlightEnabled)?.textSpan,
									textSpan,
								};
							}
						})
						.filter(notEmpty),
				};
			});
		return resolved;
	};
	languageService.getApplicableRefactors = (filePath, positionOrRange, preferences, triggerReason, kind, includeInteractiveActions) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(sourceScript, map, typeof positionOrRange === 'number' ? positionOrRange : positionOrRange.pos, isCodeActionsEnabled);
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
	languageService.getEditsForRefactor = (filePath, formatOptions, positionOrRange, refactorName, actionName, preferences) => {
		let edits: ts.RefactorEditInfo | undefined;
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(
				sourceScript,
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
				.map(edit => transformFileTextChanges(language, edit, isCodeActionsEnabled))
				.filter(notEmpty);
			return edits;
		}
	};
	languageService.getRenameInfo = (filePath, position, options) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			let failed: ts.RenameInfoFailure | undefined;
			for (const [generateOffset, mapping] of toGeneratedOffsets(sourceScript, map, position)) {
				if (!isRenameEnabled(mapping.data)) {
					continue;
				}
				const info = getRenameInfo(fileName, generateOffset, options);
				if (info.canRename) {
					const span = transformTextSpan(sourceScript, map, info.triggerSpan, isRenameEnabled);
					if (span) {
						info.triggerSpan = span;
						return info;
					}
				}
				else {
					failed = info;
				}
			}
			if (failed) {
				return failed;
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
	languageService.getCodeFixesAtPosition = (filePath, start, end, errorCodes, formatOptions, preferences) => {
		let fixes: readonly ts.CodeFixAction[] = [];
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			const generateStart = toGeneratedOffset(sourceScript, map, start, isCodeActionsEnabled);
			const generateEnd = toGeneratedOffset(sourceScript, map, end, isCodeActionsEnabled);
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
			fix.changes = fix.changes.map(edit => transformFileTextChanges(language, edit, isCodeActionsEnabled)).filter(notEmpty);
			return fix;
		});
		return fixes;
	};
	languageService.getEncodedSemanticClassifications = (filePath, span, format) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			let start: number | undefined;
			let end: number | undefined;
			for (const mapping of map.mappings) {
				// TODO reuse the logic from language service
				if (isSemanticTokensEnabled(mapping.data) && mapping.sourceOffsets[0] >= span.start && mapping.sourceOffsets[0] <= span.start + span.length) {
					start ??= mapping.generatedOffsets[0];
					end ??= mapping.generatedOffsets[mapping.generatedOffsets.length - 1] + (mapping.generatedLengths ?? mapping.lengths)[mapping.lengths.length - 1];
					start = Math.min(start, mapping.generatedOffsets[0]);
					end = Math.max(end, mapping.generatedOffsets[mapping.generatedOffsets.length - 1] + (mapping.generatedLengths ?? mapping.lengths)[mapping.lengths.length - 1]);
				}
			}
			start ??= 0;
			end ??= sourceScript.snapshot.getLength();
			start += sourceScript.snapshot.getLength();
			end += sourceScript.snapshot.getLength();
			const result = getEncodedSemanticClassifications(fileName, { start, length: end - start }, format);
			const spans: number[] = [];
			for (let i = 0; i < result.spans.length; i += 3) {
				const sourceStart = toSourceOffset(sourceScript, map, result.spans[i], isSemanticTokensEnabled);
				const sourceEnd = toSourceOffset(sourceScript, map, result.spans[i] + result.spans[i + 1], isSemanticTokensEnabled);
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
	languageService.getSyntacticDiagnostics = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		return getSyntacticDiagnostics(fileName)
			.map(d => transformDiagnostic(language, d, false))
			.filter(notEmpty);
	};
	languageService.getSemanticDiagnostics = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		return getSemanticDiagnostics(fileName)
			.map(d => transformDiagnostic(language, d, false))
			.filter(notEmpty);
	};
	languageService.getSuggestionDiagnostics = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		return getSuggestionDiagnostics(fileName)
			.map(d => transformDiagnostic(language, d, false))
			.filter(notEmpty);
	};
	languageService.getDefinitionAndBoundSpan = (filePath, position) => {
		const fileName = filePath.replace(windowsPathReg, '/');
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
			.map(s => transformSpan(language, fileName, s.textSpan, isDefinitionEnabled)?.textSpan)
			.filter(notEmpty)[0];
		if (!textSpan) {
			return;
		}
		const definitions = unresolved
			.map(s => s.definitions
				?.map(s => transformDocumentSpan(language, s, isDefinitionEnabled, s.fileName !== fileName))
				.filter(notEmpty)
			)
			.filter(notEmpty)
			.flat();
		return {
			textSpan,
			definitions: dedupeDocumentSpans(definitions),
		};
	};
	languageService.findReferences = (filePath, position) => {
		const fileName = filePath.replace(windowsPathReg, '/');
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
		const resolved: ts.ReferencedSymbol[] = unresolved
			.flat()
			.map(symbol => {
				const definition = transformDocumentSpan(language, symbol.definition, isDefinitionEnabled, true)!;
				return {
					definition,
					references: symbol.references
						.map(r => transformDocumentSpan(language, r, isReferencesEnabled))
						.filter(notEmpty),
				};
			});
		return resolved;
	};
	languageService.getDefinitionAtPosition = (filePath, position) => {
		const fileName = filePath.replace(windowsPathReg, '/');
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
			.map(s => transformDocumentSpan(language, s, isDefinitionEnabled, s.fileName !== fileName))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};
	languageService.getTypeDefinitionAtPosition = (filePath, position) => {
		const fileName = filePath.replace(windowsPathReg, '/');
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
			.map(s => transformDocumentSpan(language, s, isTypeDefinitionEnabled))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};
	languageService.getImplementationAtPosition = (filePath, position) => {
		const fileName = filePath.replace(windowsPathReg, '/');
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
			.map(s => transformDocumentSpan(language, s, isImplementationEnabled))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};
	languageService.findRenameLocations = (filePath, position, findInStrings, findInComments, preferences) => {
		const fileName = filePath.replace(windowsPathReg, '/');
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
			.map(s => transformDocumentSpan(language, s, isRenameEnabled))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};
	languageService.getReferencesAtPosition = (filePath, position) => {
		const fileName = filePath.replace(windowsPathReg, '/');
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
			.map(s => transformDocumentSpan(language, s, isReferencesEnabled))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};
	languageService.getCompletionsAtPosition = (filePath, position, options, formattingSettings) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			const results: ts.CompletionInfo[] = [];
			for (const [generatedOffset, mapping] of toGeneratedOffsets(sourceScript, map, position)) {
				if (!isCompletionEnabled(mapping.data)) {
					continue;
				}
				const result = getCompletionsAtPosition(fileName, generatedOffset, options, formattingSettings);
				if (!result) {
					continue;
				}
				if (typeof mapping.data.completion === 'object' && mapping.data.completion.onlyImport) {
					result.entries = result.entries.filter(entry => !!entry.sourceDisplay);
				}
				for (const entry of result.entries) {
					entry.replacementSpan = entry.replacementSpan && transformTextSpan(sourceScript, map, entry.replacementSpan, isCompletionEnabled);
				}
				result.optionalReplacementSpan = result.optionalReplacementSpan
					&& transformTextSpan(sourceScript, map, result.optionalReplacementSpan, isCompletionEnabled);
				const isAdditional = typeof mapping.data.completion === 'object' && mapping.data.completion.isAdditional;
				if (isAdditional) {
					results.push(result);
				}
				else {
					results.unshift(result);
				}
			}
			if (results.length) {
				return {
					...results[0],
					entries: results
						.map(additionalResult => additionalResult.entries)
						.flat(),
				};
			}
		}
		else {
			return getCompletionsAtPosition(fileName, position, options, formattingSettings);
		}
	};
	languageService.getCompletionEntryDetails = (filePath, position, entryName, formatOptions, source, preferences, data) => {

		let details: ts.CompletionEntryDetails | undefined;

		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(sourceScript, map, position, isCompletionEnabled);
			if (generatePosition !== undefined) {
				details = getCompletionEntryDetails(fileName, generatePosition, entryName, formatOptions, source, preferences, data);
			}
		}
		else {
			return getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data);
		}

		if (details?.codeActions) {
			for (const codeAction of details.codeActions) {
				codeAction.changes = codeAction.changes.map(edit => transformFileTextChanges(language, edit, isCompletionEnabled)).filter(notEmpty);
			}
		}

		return details;
	};
	languageService.provideInlayHints = (filePath, span, preferences) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
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
			start += sourceScript.snapshot.getLength();
			end += sourceScript.snapshot.getLength();
			const result = provideInlayHints(fileName, { start, length: end - start }, preferences);
			const hints: ts.InlayHint[] = [];
			for (const hint of result) {
				const sourcePosition = toSourceOffset(sourceScript, map, hint.position, isInlayHintsEnabled);
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
	languageService.getFileReferences = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const unresolved = getFileReferences(fileName);
		const resolved = unresolved
			.map(s => transformDocumentSpan(language, s, isReferencesEnabled))
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
		const results: T[] = [];
		const processedFilePositions = new Set<string>();
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			for (const [generatedOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (filter(mapping.data)) {
					process(fileName, generatedOffset + sourceScript.snapshot.getLength());
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
			results.push(result);
			for (const ref of getLinkedCodes(result)) {

				processedFilePositions.add(ref[0] + ':' + ref[1]);

				const [virtualFile, sourceScript] = getServiceScript(language, ref[0]);
				if (!virtualFile) {
					continue;
				}

				const linkedCodeMap = language.linkedCodeMaps.get(virtualFile.code);
				if (!linkedCodeMap) {
					continue;
				}

				for (const linkedCodeOffset of linkedCodeMap.getLinkedOffsets(ref[1] - sourceScript.snapshot.getLength())) {
					process(ref[0], linkedCodeOffset + sourceScript.snapshot.getLength());
				}
			}
		}
	}
}

function displayPartsToString(displayParts: ts.SymbolDisplayPart[] | undefined) {
	if (displayParts) {
		return displayParts.map(displayPart => displayPart.text).join('');
	}
	return '';
}
