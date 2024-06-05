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
	toSourceOffset, transformAndFilterDiagnostics,
	transformCallHierarchyItem,
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
	languageService: ts.LanguageService,
	caseSensitiveFileNames: boolean
) {

	// ignored methods

	const {
		getNavigationTree,
		getOutliningSpans,
	} = languageService;

	languageService.getNavigationTree = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript] = getServiceScript(language, fileName);
		if (serviceScript || sourceScript?.associatedOnly) {
			const tree = getNavigationTree(sourceScript.id);
			tree.childItems = undefined;
			return tree;
		}
		else {
			return getNavigationTree(fileName);
		}
	};
	languageService.getOutliningSpans = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript] = getServiceScript(language, fileName);
		if (serviceScript || sourceScript?.associatedOnly) {
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
		if (sourceScript?.associatedOnly) {
			return []
		}
		if (serviceScript) {
			if (!map.mappings.some(mapping => isFormattingEnabled(mapping.data))) {
				return [];
			}
			const edits = getFormattingEditsForDocument(sourceScript.id, options);
			return edits
				.map(edit => takeIfSameName(fileName, transformTextChange(serviceScript, sourceScript, map, edit, isFormattingEnabled)))
				.filter(notEmpty);
		}
		else {
			return getFormattingEditsForDocument(fileName, options);
		}
	};
	languageService.getFormattingEditsForRange = (filePath, start, end, options) => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (sourceScript?.associatedOnly) {
			return []
		}
		if (serviceScript) {
			const generateStart = toGeneratedOffset(serviceScript, sourceScript, map, start, isFormattingEnabled);
			const generateEnd = toGeneratedOffset(serviceScript, sourceScript, map, end, isFormattingEnabled);
			if (generateStart !== undefined && generateEnd !== undefined) {
				const edits = getFormattingEditsForRange(sourceScript.id, generateStart, generateEnd, options);
				return edits
					.map(edit => takeIfSameName(fileName, transformTextChange(serviceScript, sourceScript, map, edit, isFormattingEnabled)))
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
		if (sourceScript?.associatedOnly) {
			return []
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(serviceScript, sourceScript, map, position, isFormattingEnabled);
			if (generatePosition !== undefined) {
				const edits = getFormattingEditsAfterKeystroke(sourceScript.id, generatePosition, key, options);
				return edits
					.map(edit => takeIfSameName(fileName, transformTextChange(serviceScript, sourceScript, map, edit, isFormattingEnabled)))
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
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (sourceScript?.associatedOnly) {
			return undefined
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(serviceScript, sourceScript, map, position, isLinkedEditingEnabled);
			if (generatePosition !== undefined) {
				const info = getLinkedEditingRangeAtPosition(sourceScript.id, generatePosition);
				if (info) {
					return {
						ranges: info.ranges
							.map(span => takeIfSameName(fileName, transformTextSpan(serviceScript, sourceScript, map, span, isLinkedEditingEnabled)))
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
		if (sourceScript?.associatedOnly) {
			return undefined
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(serviceScript, sourceScript, map, position, isCallHierarchyEnabled);
			if (generatePosition !== undefined) {
				const item = prepareCallHierarchy(sourceScript.id, generatePosition);
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
		if (sourceScript?.associatedOnly) {
			return []
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(serviceScript, sourceScript, map, position, isCallHierarchyEnabled);
			if (generatePosition !== undefined) {
				calls = provideCallHierarchyIncomingCalls(sourceScript.id, generatePosition);
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
		if (sourceScript?.associatedOnly) {
			return []
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(serviceScript, sourceScript, map, position, isCallHierarchyEnabled);
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
						? takeIfSameName(fileName, transformTextSpan(serviceScript, sourceScript, map, span, isCallHierarchyEnabled))
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
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (sourceScript?.associatedOnly) {
			return undefined
		}
		if (serviceScript) {
			const infos: ts.QuickInfo[] = [];
			for (const [generatePosition, mapping] of toGeneratedOffsets(serviceScript, sourceScript, map, position)) {
				if (!isHoverEnabled(mapping.data)) {
					continue;
				}
				const info = getQuickInfoAtPosition(sourceScript.id, generatePosition);
				if (info) {
					const textSpan = takeIfSameName(fileName, transformTextSpan(serviceScript, sourceScript, map, info.textSpan, isHoverEnabled));
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
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (sourceScript?.associatedOnly) {
			return undefined
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(serviceScript, sourceScript, map, position, isSignatureHelpEnabled);
			if (generatePosition !== undefined) {
				const result = getSignatureHelpItems(sourceScript.id, generatePosition, options);
				if (result) {
					const applicableSpan = takeIfSameName(fileName, transformTextSpan(serviceScript, sourceScript, map, result.applicableSpan, isSignatureHelpEnabled));
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
							const { fileName: spanFileName, textSpan } = transformSpan(language, span.fileName ?? highlights.fileName, span.textSpan, isHighlightEnabled) ?? {};
							if (textSpan && sameName(spanFileName, fileName)) {
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
		if (sourceScript?.associatedOnly) {
			return []
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(serviceScript, sourceScript, map, typeof positionOrRange === 'number' ? positionOrRange : positionOrRange.pos, isCodeActionsEnabled);
			if (generatePosition !== undefined) {
				const por = typeof positionOrRange === 'number'
					? generatePosition
					: {
						pos: generatePosition,
						end: generatePosition + positionOrRange.end - positionOrRange.pos,
					};
				return getApplicableRefactors(sourceScript.id, por, preferences, triggerReason, kind, includeInteractiveActions);
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
		if (sourceScript?.associatedOnly) {
			return undefined
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(
				serviceScript,
				sourceScript,
				map,
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
				edits = getEditsForRefactor(sourceScript.id, formatOptions, por, refactorName, actionName, preferences);
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
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (sourceScript?.associatedOnly) {
			return {
				canRename: false,
				localizedErrorMessage: "Cannot rename"
			}
		}
		if (serviceScript) {
			let failed: ts.RenameInfoFailure | undefined;
			for (const [generateOffset, mapping] of toGeneratedOffsets(serviceScript, sourceScript, map, position)) {
				if (!isRenameEnabled(mapping.data)) {
					continue;
				}
				const info = getRenameInfo(sourceScript.id, generateOffset, options);
				if (info.canRename) {
					const span = takeIfSameName(fileName, transformTextSpan(serviceScript, sourceScript, map, info.triggerSpan, isRenameEnabled));
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
		if (sourceScript?.associatedOnly) {
			return []
		}
		if (serviceScript) {
			const generateStart = toGeneratedOffset(serviceScript, sourceScript, map, start, isCodeActionsEnabled);
			const generateEnd = toGeneratedOffset(serviceScript, sourceScript, map, end, isCodeActionsEnabled);
			if (generateStart !== undefined && generateEnd !== undefined) {
				fixes = getCodeFixesAtPosition(
					sourceScript.id,
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
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (sourceScript?.associatedOnly) {
			return {
				spans: [],
				endOfLineState: 0
			}
		}
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
			const mappingOffset = getMappingOffset(serviceScript, sourceScript);
			start += mappingOffset;
			end += mappingOffset;
			const result = getEncodedSemanticClassifications(sourceScript.id, { start, length: end - start }, format);
			const spans: number[] = [];
			for (let i = 0; i < result.spans.length; i += 3) {
				const sourceStart = takeIfSameName(fileName, toSourceOffset(serviceScript, sourceScript, map, result.spans[i], isSemanticTokensEnabled));
				const sourceEnd = takeIfSameName(fileName, toSourceOffset(serviceScript, sourceScript, map, result.spans[i] + result.spans[i + 1], isSemanticTokensEnabled));
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
		const [_serviceScript, sourceScript] = getServiceScript(language, fileName);
		if (sourceScript?.associatedOnly) {
			return []
		}
		return transformAndFilterDiagnostics(getSyntacticDiagnostics(sourceScript?.id ?? fileName),
			language, fileName, languageService.getProgram(), false)
	};
	languageService.getSemanticDiagnostics = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [_serviceScript, sourceScript] = getServiceScript(language, fileName);
		if (sourceScript?.associatedOnly) {
			return []
		}
		return transformAndFilterDiagnostics(getSemanticDiagnostics(sourceScript?.id ?? fileName),
			language, fileName, languageService.getProgram(), false)
	};
	languageService.getSuggestionDiagnostics = filePath => {
		const fileName = filePath.replace(windowsPathReg, '/');
		const [_serviceScript, sourceScript] = getServiceScript(language, fileName);
		if (sourceScript?.associatedOnly) {
			return []
		}
		return transformAndFilterDiagnostics(getSuggestionDiagnostics(sourceScript?.id ?? fileName),
			language, fileName, languageService.getProgram(), false)
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
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (sourceScript?.associatedOnly) {
			return undefined
		}
		if (serviceScript) {
			const results: ts.CompletionInfo[] = [];
			for (const [generatedOffset, mapping] of toGeneratedOffsets(serviceScript, sourceScript, map, position)) {
				if (!isCompletionEnabled(mapping.data)) {
					continue;
				}
				const result = getCompletionsAtPosition(sourceScript.id, generatedOffset, options, formattingSettings);
				if (!result) {
					continue;
				}
				if (typeof mapping.data.completion === 'object' && mapping.data.completion.onlyImport) {
					result.entries = result.entries.filter(entry => !!entry.sourceDisplay);
				}
				for (const entry of result.entries) {
					entry.replacementSpan = entry.replacementSpan && takeIfSameName(fileName, transformTextSpan(serviceScript, sourceScript, map, entry.replacementSpan, isCompletionEnabled));
				}
				result.optionalReplacementSpan = result.optionalReplacementSpan
					&& takeIfSameName(fileName, transformTextSpan(serviceScript, sourceScript, map, result.optionalReplacementSpan, isCompletionEnabled));
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
		if (sourceScript?.associatedOnly) {
			return undefined
		}
		if (serviceScript) {
			const generatePosition = toGeneratedOffset(serviceScript, sourceScript, map, position, isCompletionEnabled);
			if (generatePosition !== undefined) {
				details = getCompletionEntryDetails(sourceScript.id, generatePosition, entryName, formatOptions, source, preferences, data);
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
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (sourceScript?.associatedOnly) {
			return []
		}
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
			const mappingOffset = getMappingOffset(serviceScript, sourceScript);
			start += mappingOffset;
			end += mappingOffset;
			const result = provideInlayHints(sourceScript.id, { start, length: end - start }, preferences);
			const hints: ts.InlayHint[] = [];
			for (const hint of result) {
				const sourcePosition = takeIfSameName(fileName, toSourceOffset(serviceScript, sourceScript, map, hint.position, isInlayHintsEnabled));
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
		worker: (fileName: string, position: number) => T | undefined,
		getLinkedCodes: (result: T) => Generator<[fileName: string, position: number]>
	) {
		const results: T[] = [];
		const processedFilePositions = new Set<string>();
		const [serviceScript, sourceScript, map] = getServiceScript(language, fileName);
		if (serviceScript) {
			for (const [generatedOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (filter(mapping.data)) {
					process(sourceScript.id, generatedOffset + getMappingOffset(serviceScript, sourceScript));
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
			const result = worker(fileName, position);
			if (!result) {
				return;
			}
			results.push(result);
			for (const ref of getLinkedCodes(result)) {

				processedFilePositions.add(ref[0] + ':' + ref[1]);

				const [serviceScript, sourceScript] = getServiceScript(language, ref[0]);
				if (!serviceScript) {
					continue;
				}

				const linkedCodeMap = language.linkedCodeMaps.get(serviceScript.code);
				if (!linkedCodeMap) {
					continue;
				}

				const mappingOffset = getMappingOffset(serviceScript, sourceScript);
				for (const linkedCodeOffset of linkedCodeMap.getLinkedOffsets(ref[1] - mappingOffset)) {
					process(ref[0], linkedCodeOffset + mappingOffset);
				}
			}
		}
	}

	function normalizeId(id: string): string {
		return caseSensitiveFileNames ? id : id.toLowerCase()
	}

	function sameName(name1: string | undefined, name2: string | undefined): boolean {
		return !!name1 && !!name2 && normalizeId(name1) === normalizeId(name2)
	}

	function takeIfSameName<T>(name: string | undefined, value: [string, T] | undefined): T | undefined {
		if (value && sameName(name, value[0])) {
			return value[1]
		}
		return undefined
	}
}

function displayPartsToString(displayParts: ts.SymbolDisplayPart[] | undefined) {
	if (displayParts) {
		return displayParts.map(displayPart => displayPart.text).join('');
	}
	return '';
}
