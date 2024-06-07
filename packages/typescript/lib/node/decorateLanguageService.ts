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
import {
	getMappingOffset,
	toGeneratedOffset,
	toGeneratedOffsets,
	toSourceOffset,
	toSourceOffsets,
	transformCallHierarchyItem,
	transformDiagnostic,
	transformDocumentSpan,
	transformFileTextChanges,
	transformSpan,
	transformTextChange,
	transformTextSpan,
} from './transform';
import { getServiceScript, notEmpty } from './utils';

const windowsPathReg = /\\/g;

export function decorateLanguageService(
	language: Language<string>,
	languageService: ts.LanguageService
) {

	// ignored methods

	const {
		getNavigationTree,
		getOutliningSpans,
	} = languageService;

	languageService.getNavigationTree = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, targetScript] = getServiceScript(language, fileName);
		if (serviceScript || targetScript?.associatedOnly) {
			const tree = getNavigationTree(targetScript.id);
			tree.childItems = undefined;
			return tree;
		}
		else {
			return getNavigationTree(fileName);
		}
	};
	languageService.getOutliningSpans = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, targetScript] = getServiceScript(language, fileName);
		if (serviceScript || targetScript?.associatedOnly) {
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
		const [serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return [];
		}
		if (serviceScript) {
			const map = language.maps.get(serviceScript.code, targetScript);
			if (!map.mappings.some(mapping => isFormattingEnabled(mapping.data))) {
				return [];
			}
			const edits = getFormattingEditsForDocument(targetScript.id, options);
			return edits
				.map(edit => transformTextChange(sourceScript, language, serviceScript, edit, isFormattingEnabled)?.[1])
				.filter(notEmpty);
		}
		else {
			return getFormattingEditsForDocument(fileName, options);
		}
	};
	languageService.getFormattingEditsForRange = (filePath, start, end, options) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return [];
		}
		if (serviceScript) {
			const generateStart = toGeneratedOffset(language, serviceScript, targetScript, start, isFormattingEnabled);
			const generateEnd = toGeneratedOffset(language, serviceScript, targetScript, end, isFormattingEnabled);
			if (generateStart !== undefined && generateEnd !== undefined) {
				const edits = getFormattingEditsForRange(targetScript.id, generateStart, generateEnd, options);
				return edits
					.map(edit => transformTextChange(sourceScript, language, serviceScript, edit, isFormattingEnabled)?.[1])
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
		const [serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return [];
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(language, serviceScript, targetScript, position, isFormattingEnabled);
			if (generatePosition !== undefined) {
				const edits = getFormattingEditsAfterKeystroke(targetScript.id, generatePosition, key, options);
				return edits
					.map(edit => transformTextChange(sourceScript, language, serviceScript, edit, isFormattingEnabled)?.[1])
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
		return transformFileTextChanges(language, edits, isRenameEnabled);
	};
	languageService.getLinkedEditingRangeAtPosition = (filePath, position) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return undefined;
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(language, serviceScript, targetScript, position, isLinkedEditingEnabled);
			if (generatePosition !== undefined) {
				const info = getLinkedEditingRangeAtPosition(targetScript.id, generatePosition);
				if (info) {
					return {
						ranges: info.ranges
							.map(span => transformTextSpan(sourceScript, language, serviceScript, span, isLinkedEditingEnabled)?.[1])
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
		const [serviceScript, targetScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return undefined;
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(language, serviceScript, targetScript, position, isCallHierarchyEnabled);
			if (generatePosition !== undefined) {
				const item = prepareCallHierarchy(targetScript.id, generatePosition);
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
		const [serviceScript, targetScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return [];
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(language, serviceScript, targetScript, position, isCallHierarchyEnabled);
			if (generatePosition !== undefined) {
				calls = provideCallHierarchyIncomingCalls(targetScript.id, generatePosition);
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
		const [serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return [];
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(language, serviceScript, targetScript, position, isCallHierarchyEnabled);
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
					.map(span => serviceScript
						? transformTextSpan(sourceScript, language, serviceScript, span, isCallHierarchyEnabled)?.[1]
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
		return transformFileTextChanges(language, unresolved, isCodeActionsEnabled);
	};
	languageService.getQuickInfoAtPosition = (filePath, position) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return undefined;
		}
		if (serviceScript) {
			const infos: ts.QuickInfo[] = [];
			for (const [generatePosition] of toGeneratedOffsets(language, serviceScript, targetScript, position, isHoverEnabled)) {
				const info = getQuickInfoAtPosition(targetScript.id, generatePosition);
				if (info) {
					const textSpan = transformTextSpan(sourceScript, language, serviceScript, info.textSpan, isHoverEnabled)?.[1];
					if (textSpan) {
						infos.push({
							...info,
							textSpan: textSpan,
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
		const [serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return undefined;
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(language, serviceScript, targetScript, position, isSignatureHelpEnabled);
			if (generatePosition !== undefined) {
				const result = getSignatureHelpItems(targetScript.id, generatePosition, options);
				if (result) {
					const applicableSpan = transformTextSpan(sourceScript, language, serviceScript, result.applicableSpan, isSignatureHelpEnabled)?.[1];
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
			(fileName, position) => getDocumentHighlights(fileName, position, filesToSearch),
			function* (result) {
				for (const ref of result) {
					for (const reference of ref.highlightSpans) {
						yield [reference.fileName ?? ref.fileName, reference.textSpan.start];
					}
				}
			}
		);
		const resolved = unresolved
			.flat()
			.map(highlights => {
				return {
					...highlights,
					highlightSpans: highlights.highlightSpans
						.map(span => {
							const { textSpan } = transformSpan(language, span.fileName ?? highlights.fileName, span.textSpan, isHighlightEnabled) ?? {};
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
		const [serviceScript, targetScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return [];
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(language, serviceScript, targetScript, typeof positionOrRange === 'number' ? positionOrRange : positionOrRange.pos, isCodeActionsEnabled);
			if (generatePosition !== undefined) {
				const por = typeof positionOrRange === 'number'
					? generatePosition
					: {
						pos: generatePosition,
						end: generatePosition + positionOrRange.end - positionOrRange.pos,
					};
				return getApplicableRefactors(targetScript.id, por, preferences, triggerReason, kind, includeInteractiveActions);
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
		const [serviceScript, targetScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return undefined;
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(
				language,
				serviceScript,
				targetScript,
				typeof positionOrRange === 'number'
					? positionOrRange
					: positionOrRange.pos,
				isCodeActionsEnabled
			);
			if (generatePosition !== undefined) {
				const por = typeof positionOrRange === 'number'
					? generatePosition
					: {
						pos: generatePosition,
						end: generatePosition + positionOrRange.end - positionOrRange.pos,
					};
				edits = getEditsForRefactor(targetScript.id, formatOptions, por, refactorName, actionName, preferences);
			}
		}
		else {
			edits = getEditsForRefactor(fileName, formatOptions, positionOrRange, refactorName, actionName, preferences);
		}
		if (edits) {
			edits.edits = transformFileTextChanges(language, edits.edits, isCodeActionsEnabled);
			return edits;
		}
	};
	languageService.getRenameInfo = (filePath, position, options) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return {
				canRename: false,
				localizedErrorMessage: "Cannot rename"
			};
		}
		if (serviceScript) {
			let failed: ts.RenameInfoFailure | undefined;
			for (const [generateOffset] of toGeneratedOffsets(language, serviceScript, targetScript, position, isRenameEnabled)) {
				const info = getRenameInfo(targetScript.id, generateOffset, options);
				if (info.canRename) {
					const span = transformTextSpan(sourceScript, language, serviceScript, info.triggerSpan, isRenameEnabled)?.[1];
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
		const [serviceScript, targetScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return [];
		}
		if (serviceScript) {
			const generateStart = toGeneratedOffset(language, serviceScript, targetScript, start, isCodeActionsEnabled);
			const generateEnd = toGeneratedOffset(language, serviceScript, targetScript, end, isCodeActionsEnabled);
			if (generateStart !== undefined && generateEnd !== undefined) {
				fixes = getCodeFixesAtPosition(
					targetScript.id,
					generateStart,
					generateEnd,
					errorCodes,
					formatOptions,
					preferences
				);
			}
		}
		else {
			fixes = getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, preferences);
		}
		fixes = fixes.map(fix => {
			fix.changes = transformFileTextChanges(language, fix.changes, isCodeActionsEnabled);
			return fix;
		});
		return fixes;
	};
	languageService.getEncodedSemanticClassifications = (filePath, span, format) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return {
				spans: [],
				endOfLineState: 0
			};
		}
		if (serviceScript) {
			let start: number | undefined;
			let end: number | undefined;
			const map = language.maps.get(serviceScript.code, targetScript);
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
			end ??= targetScript.snapshot.getLength();
			const mappingOffset = getMappingOffset(language, serviceScript);
			start += mappingOffset;
			end += mappingOffset;
			const result = getEncodedSemanticClassifications(targetScript.id, { start, length: end - start }, format);
			const spans: number[] = [];
			for (let i = 0; i < result.spans.length; i += 3) {
				for (const sourceStart of toSourceOffsets(sourceScript, language, serviceScript, result.spans[i], isSemanticTokensEnabled)) {
					for (const sourceEnd of toSourceOffsets(sourceScript, language, serviceScript, result.spans[i] + result.spans[i + 1], isSemanticTokensEnabled)) {
						if (sourceStart[0] === sourceEnd[0] && sourceEnd[1] >= sourceStart[1]) {
							spans.push(
								sourceStart[1],
								sourceEnd[1] - sourceStart[1],
								result.spans[i + 2]
							);
							break;
						}
					}
					if (spans.length) {
						break;
					}
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
		const [_serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return [];
		}
		return getSyntacticDiagnostics(targetScript?.id ?? fileName)
			.map(d => transformDiagnostic(sourceScript, language, d, languageService.getProgram(), false))
			.filter(notEmpty);
	};
	languageService.getSemanticDiagnostics = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [_serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return [];
		}
		return getSemanticDiagnostics(targetScript?.id ?? fileName)
			.map(d => transformDiagnostic(sourceScript, language, d, languageService.getProgram(), false))
			.filter(notEmpty);
	};
	languageService.getSuggestionDiagnostics = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [_serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return [];
		}
		return getSuggestionDiagnostics(targetScript?.id ?? fileName)
			.map(d => transformDiagnostic(sourceScript, language, d, languageService.getProgram(), false))
			.filter(notEmpty);
	};
	languageService.getDefinitionAndBoundSpan = (filePath, position) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const unresolved = linkedCodeFeatureWorker(
			fileName,
			position,
			isDefinitionEnabled,
			(fileName, position) => getDefinitionAndBoundSpan(fileName, position),
			function* (result) {
				for (const ref of result.definitions ?? []) {
					yield [ref.fileName, ref.textSpan.start];
				}
			}
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
			(fileName, position) => findReferences(fileName, position),
			function* (result) {
				for (const ref of result) {
					for (const reference of ref.references) {
						yield [reference.fileName, reference.textSpan.start];
					}
				}
			}
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
			(fileName, position) => getDefinitionAtPosition(fileName, position),
			function* (result) {
				for (const ref of result) {
					yield [ref.fileName, ref.textSpan.start];
				}
			}
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
			(fileName, position) => getTypeDefinitionAtPosition(fileName, position),
			function* (result) {
				for (const ref of result) {
					yield [ref.fileName, ref.textSpan.start];
				}
			}
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
			(fileName, position) => getImplementationAtPosition(fileName, position),
			function* (result) {
				for (const ref of result) {
					yield [ref.fileName, ref.textSpan.start];
				}
			}
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
			(fileName, position) => findRenameLocations(fileName, position, findInStrings, findInComments, preferences as ts.UserPreferences),
			function* (result) {
				for (const ref of result) {
					yield [ref.fileName, ref.textSpan.start];
				}
			}
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
			(fileName, position) => getReferencesAtPosition(fileName, position),
			function* (result) {
				for (const ref of result) {
					yield [ref.fileName, ref.textSpan.start];
				}
			}
		);
		const resolved = unresolved
			.flat()
			.map(s => transformDocumentSpan(language, s, isReferencesEnabled))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};
	languageService.getCompletionsAtPosition = (filePath, position, options, formattingSettings) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return undefined;
		}
		if (serviceScript) {
			const results: ts.CompletionInfo[] = [];
			for (const [generatedOffset, mapping] of toGeneratedOffsets(language, serviceScript, targetScript, position, isCompletionEnabled)) {
				const result = getCompletionsAtPosition(targetScript.id, generatedOffset, options, formattingSettings);
				if (!result) {
					continue;
				}
				if (typeof mapping.data.completion === 'object' && mapping.data.completion.onlyImport) {
					result.entries = result.entries.filter(entry => !!entry.sourceDisplay);
				}
				for (const entry of result.entries) {
					entry.replacementSpan = entry.replacementSpan && transformTextSpan(sourceScript, language, serviceScript, entry.replacementSpan, isCompletionEnabled)?.[1];
				}
				result.optionalReplacementSpan = result.optionalReplacementSpan
					&& transformTextSpan(sourceScript, language, serviceScript, result.optionalReplacementSpan, isCompletionEnabled)?.[1];
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
		const [serviceScript, targetScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return undefined;
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(language, serviceScript, targetScript, position, isCompletionEnabled);
			if (generatePosition !== undefined) {
				details = getCompletionEntryDetails(targetScript.id, generatePosition, entryName, formatOptions, source, preferences, data);
			}
		}
		else {
			return getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data);
		}

		if (details?.codeActions) {
			for (const codeAction of details.codeActions) {
				codeAction.changes = transformFileTextChanges(language, codeAction.changes, isCompletionEnabled);
			}
		}

		return details;
	};
	languageService.provideInlayHints = (filePath, span, preferences) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, targetScript, sourceScript] = getServiceScript(language, fileName);
		if (targetScript?.associatedOnly) {
			return [];
		}
		if (serviceScript) {
			let start: number | undefined;
			let end: number | undefined;
			const map = language.maps.get(serviceScript.code, targetScript);
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
			const mappingOffset = getMappingOffset(language, serviceScript);
			start += mappingOffset;
			end += mappingOffset;
			const result = provideInlayHints(targetScript.id, { start, length: end - start }, preferences);
			const hints: ts.InlayHint[] = [];
			for (const hint of result) {
				const sourcePosition = toSourceOffset(sourceScript, language, serviceScript, hint.position, isInlayHintsEnabled);
				if (sourcePosition !== undefined) {
					hints.push({
						...hint,
						position: sourcePosition[1],
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
		worker: (fileName: string, position: number) => T | undefined,
		getLinkedCodes: (result: T) => Generator<[fileName: string, position: number]>
	) {
		const results: T[] = [];
		const processedFilePositions = new Set<string>();
		const [serviceScript, targetScript] = getServiceScript(language, fileName);
		if (serviceScript) {
			for (const [generatedOffset] of toGeneratedOffsets(language, serviceScript, targetScript, position, filter)) {
				process(targetScript.id, generatedOffset);
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
			const result = worker(fileName, position);
			if (!result) {
				return;
			}
			results.push(result);
			for (const ref of getLinkedCodes(result)) {

				processedFilePositions.add(ref[0] + ':' + ref[1]);

				const [serviceScript] = getServiceScript(language, ref[0]);
				if (!serviceScript) {
					continue;
				}

				const linkedCodeMap = language.linkedCodeMaps.get(serviceScript.code);
				if (!linkedCodeMap) {
					continue;
				}

				const mappingOffset = getMappingOffset(language, serviceScript);
				for (const linkedCodeOffset of linkedCodeMap.getLinkedOffsets(ref[1] - mappingOffset)) {
					process(ref[0], linkedCodeOffset + mappingOffset);
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
