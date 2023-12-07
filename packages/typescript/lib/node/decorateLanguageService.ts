import {
	CodeInformation,
	FileProvider,
	forEachEmbeddedFile,
	isCallHierarchyEnabled,
	isCodeActionsEnabled,
	isCodeLensEnabled,
	isCompletionEnabled,
	isDefinitionEnabled,
	isHighlightEnabled,
	isHoverEnabled,
	isImplementationEnabled,
	isInlayHintsEnabled,
	isReferencesEnabled,
	isRenameEnabled,
	isSemanticTokensEnabled,
	isTypeDefinitionEnabled,
	shouldReportDiagnostics,
} from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { dedupeDocumentSpans, dedupeReferencedSymbols } from './dedupe';

export function decorateLanguageService(virtualFiles: FileProvider, languageService: ts.LanguageService, isTsPlugin: boolean) {

	const transformedDiagnostics = new WeakMap<ts.Diagnostic, ts.Diagnostic | undefined>();

	const {
		findReferences,
		findRenameLocations,
		getCompletionEntryDetails,
		getCompletionsAtPosition,
		getDefinitionAndBoundSpan,
		getDefinitionAtPosition,
		getFileReferences,
		getImplementationAtPosition,
		getQuickInfoAtPosition,
		getReferencesAtPosition,
		getSemanticDiagnostics,
		getSyntacticDiagnostics,
		getSuggestionDiagnostics,
		getTypeDefinitionAtPosition,
		getEncodedSemanticClassifications,
		getDocumentHighlights,
		getApplicableRefactors,
		getEditsForRefactor,
		getRenameInfo,
		getCodeFixesAtPosition,
		prepareCallHierarchy,
		provideCallHierarchyIncomingCalls,
		provideCallHierarchyOutgoingCalls,
		provideInlayHints,
		organizeImports,
	} = languageService;

	languageService.prepareCallHierarchy = (fileName, position) => {
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (isCallHierarchyEnabled(mapping.data)) {
					const item = prepareCallHierarchy(fileName, generateOffset + (isTsPlugin ? sourceFile.snapshot.getLength() : 0));
					if (Array.isArray(item)) {
						return item.map(item => transformCallHierarchyItem(item, isCallHierarchyEnabled));
					}
					else if (item) {
						return transformCallHierarchyItem(item, isCallHierarchyEnabled);
					}
				}
			}
		}
		else {
			return prepareCallHierarchy(fileName, position);
		}
	};
	languageService.provideCallHierarchyIncomingCalls = (fileName, position) => {
		let calls: ts.CallHierarchyIncomingCall[] = [];
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (isCallHierarchyEnabled(mapping.data)) {
					calls = provideCallHierarchyIncomingCalls(fileName, generateOffset + (isTsPlugin ? sourceFile.snapshot.getLength() : 0));
				}
			}
		}
		else {
			calls = provideCallHierarchyIncomingCalls(fileName, position);
		}
		return calls
			.map(call => {
				const from = transformCallHierarchyItem(call.from, isCallHierarchyEnabled);
				const fromSpans = call.fromSpans
					.map(span => transformSpan(call.from.file, span, isCallHierarchyEnabled)?.textSpan)
					.filter(notEmpty);
				return {
					from,
					fromSpans,
				};
			});
	};
	languageService.provideCallHierarchyOutgoingCalls = (fileName, position) => {
		let calls: ts.CallHierarchyOutgoingCall[] = [];
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (isCallHierarchyEnabled(mapping.data)) {
					calls = provideCallHierarchyOutgoingCalls(fileName, generateOffset + (isTsPlugin ? sourceFile.snapshot.getLength() : 0));
				}
			}
		}
		else {
			calls = provideCallHierarchyOutgoingCalls(fileName, position);
		}
		return calls
			.map(call => {
				const to = transformCallHierarchyItem(call.to, isCallHierarchyEnabled);
				const fromSpans = call.fromSpans
					.map(span => transformSpan(fileName, span, isCallHierarchyEnabled)?.textSpan)
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
			.map(changes => transformFileTextChanges(changes, isCodeActionsEnabled))
			.filter(notEmpty);
		return resolved;
	};
	languageService.getQuickInfoAtPosition = (fileName, position) => {
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (isHoverEnabled(mapping.data)) {
					const result = getQuickInfoAtPosition(fileName, generateOffset + (isTsPlugin ? sourceFile.snapshot.getLength() : 0));
					if (result) {
						const textSpan = transformSpan(fileName, result.textSpan, isHoverEnabled)?.textSpan;
						if (textSpan) {
							return {
								...result,
								textSpan,
							};
						}
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
							const textSpan = transformSpan(span.fileName ?? highlights.fileName, span.textSpan, isHighlightEnabled)?.textSpan;
							if (textSpan) {
								return {
									...span,
									contextSpan: transformSpan(span.fileName ?? highlights.fileName, span.contextSpan, isHighlightEnabled)?.textSpan,
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
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(typeof positionOrRange === 'number' ? positionOrRange : positionOrRange.pos)) {
				if (isCodeActionsEnabled(mapping.data)) {
					const por = typeof positionOrRange === 'number'
						? generateOffset + (isTsPlugin ? sourceFile.snapshot.getLength() : 0)
						: {
							pos: generateOffset + (isTsPlugin ? sourceFile.snapshot.getLength() : 0),
							end: generateOffset + positionOrRange.end - positionOrRange.pos + (isTsPlugin ? sourceFile.snapshot.getLength() : 0),
						};
					return getApplicableRefactors(fileName, por, preferences, triggerReason, kind, includeInteractiveActions);
				}
			}
			return [];
		}
		else {
			return getApplicableRefactors(fileName, positionOrRange, preferences, triggerReason, kind, includeInteractiveActions);
		}
	};
	languageService.getEditsForRefactor = (fileName, formatOptions, positionOrRange, refactorName, actionName, preferences) => {
		let edits: ts.RefactorEditInfo | undefined;
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(typeof positionOrRange === 'number' ? positionOrRange : positionOrRange.pos)) {
				if (isCodeActionsEnabled(mapping.data)) {
					const por = typeof positionOrRange === 'number'
						? generateOffset + (isTsPlugin ? sourceFile.snapshot.getLength() : 0)
						: {
							pos: generateOffset + (isTsPlugin ? sourceFile.snapshot.getLength() : 0),
							end: generateOffset + positionOrRange.end - positionOrRange.pos + (isTsPlugin ? sourceFile.snapshot.getLength() : 0),
						};
					edits = getEditsForRefactor(fileName, formatOptions, por, refactorName, actionName, preferences);
				}
			}
		}
		else {
			edits = getEditsForRefactor(fileName, formatOptions, positionOrRange, refactorName, actionName, preferences);
		}
		if (edits) {
			edits.edits = edits.edits
				.map(edit => transformFileTextChanges(edit, isCodeActionsEnabled))
				.filter(notEmpty);
			return edits;
		}
	};
	languageService.getRenameInfo = (fileName, position, options) => {
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (isRenameEnabled(mapping.data)) {
					const info = getRenameInfo(fileName, generateOffset + (isTsPlugin ? sourceFile.snapshot.getLength() : 0), options);
					if (info.canRename) {
						const span = transformSpan(fileName, info.triggerSpan, isRenameEnabled);
						if (span) {
							info.triggerSpan = span.textSpan;
							return info;
						}
					}
					else {
						return info;
					}
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
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateStart, mapping] of map.getGeneratedOffsets(start)) {
				if (isCodeActionsEnabled(mapping.data)) {
					for (const [generateEnd, mapping] of map.getGeneratedOffsets(end)) {
						if (isCodeActionsEnabled(mapping.data)) {
							fixes = getCodeFixesAtPosition(
								fileName,
								generateStart + (isTsPlugin ? sourceFile.snapshot.getLength() : 0),
								generateEnd + (isTsPlugin ? sourceFile.snapshot.getLength() : 0),
								errorCodes,
								formatOptions,
								preferences,
							);
							break;
						}
					}
					break;
				}
			}
		}
		else {
			fixes = getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, preferences);
		}
		fixes = fixes.map(fix => {
			fix.changes = fix.changes.map(edit => transformFileTextChanges(edit, isCodeActionsEnabled)).filter(notEmpty);
			return fix;
		});
		return fixes;
	};
	languageService.getEncodedSemanticClassifications = (fileName, span, format) => {
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
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
			if (isTsPlugin) {
				start += sourceFile.snapshot.getLength();
				end += sourceFile.snapshot.getLength();
			}
			const result = getEncodedSemanticClassifications(fileName, { start, length: end - start }, format);
			const spans: number[] = [];
			for (let i = 0; i < result.spans.length; i += 3) {
				for (const [sourceStart, mapping] of map.getSourceOffsets(result.spans[i] - (isTsPlugin ? sourceFile.snapshot.getLength() : 0))) {
					if (isSemanticTokensEnabled(mapping.data)) {
						for (const [sourceEnd, mapping] of map.getSourceOffsets(result.spans[i] + result.spans[i + 1] - (isTsPlugin ? sourceFile.snapshot.getLength() : 0))) {
							if (isSemanticTokensEnabled(mapping.data)) {
								spans.push(
									sourceStart,
									sourceEnd - sourceStart,
									result.spans[i + 2]
								);
								break;
							}
						}
						break;
					}
				}
			}
			result.spans = spans;
			return result;
		}
		else {
			return getEncodedSemanticClassifications(fileName, span);
		}
	};
	languageService.getSyntacticDiagnostics = (fileName) => {
		return getSyntacticDiagnostics(fileName)
			.map(diagnostic => transformDiagnostic(diagnostic))
			.filter(notEmpty);
	};
	languageService.getSemanticDiagnostics = (fileName) => {
		return getSemanticDiagnostics(fileName)
			.map(diagnostic => transformDiagnostic(diagnostic))
			.filter(notEmpty);
	};
	languageService.getSuggestionDiagnostics = (fileName) => {
		return getSuggestionDiagnostics(fileName)
			.map(diagnostic => transformDiagnostic(diagnostic))
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
			.map(s => transformSpan(fileName, s.textSpan, isDefinitionEnabled)?.textSpan)
			.filter(notEmpty)[0];
		if (!textSpan) return;
		const definitions = unresolved
			.map(s => s.definitions
				?.map(s => transformDocumentSpan(s, isDefinitionEnabled, s.fileName !== fileName))
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
				const definition = transformDocumentSpan(symbol.definition, isDefinitionEnabled);
				if (definition) {
					return {
						definition,
						references: symbol.references
							.map(r => transformDocumentSpan(r, isReferencesEnabled))
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
			.map(s => transformDocumentSpan(s, isDefinitionEnabled, s.fileName !== fileName))
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
			.map(s => transformDocumentSpan(s, isTypeDefinitionEnabled))
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
			.map(s => transformDocumentSpan(s, isImplementationEnabled))
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
			.map(s => transformDocumentSpan(s, isRenameEnabled))
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
			.map(s => transformDocumentSpan(s, isReferencesEnabled))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};
	languageService.getCompletionsAtPosition = (fileName, position, options, formattingSettings) => {
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (isCompletionEnabled(mapping.data)) {
					const result = getCompletionsAtPosition(fileName, generateOffset + (isTsPlugin ? sourceFile.snapshot.getLength() : 0), options, formattingSettings);
					if (result) {
						for (const entry of result.entries) {
							entry.replacementSpan = transformSpan(fileName, entry.replacementSpan, isCompletionEnabled)?.textSpan;
						}
						result.optionalReplacementSpan = transformSpan(fileName, result.optionalReplacementSpan, isCompletionEnabled)?.textSpan;
					}
					return result;
				}
			}
		}
		else {
			return getCompletionsAtPosition(fileName, position, options, formattingSettings);
		}
	};
	languageService.getCompletionEntryDetails = (fileName, position, entryName, formatOptions, source, preferences, data) => {
		const details = getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data);
		if (details?.codeActions) {
			for (const codeAction of details.codeActions) {
				codeAction.changes = codeAction.changes.map(edit => transformFileTextChanges(edit, isCodeLensEnabled)).filter(notEmpty);
			}
		}
		return details;
	};
	languageService.provideInlayHints = (fileName, span, preferences) => {
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
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
			if (isTsPlugin) {
				start += sourceFile.snapshot.getLength();
				end += sourceFile.snapshot.getLength();
			}
			const result = provideInlayHints(fileName, { start, length: end - start }, preferences);
			const hints: ts.InlayHint[] = [];
			for (const hint of result) {
				for (const [sourcePosition, mapping] of map.getSourceOffsets(hint.position - (isTsPlugin ? sourceFile.snapshot.getLength() : 0))) {
					if (isInlayHintsEnabled(mapping.data)) {
						hints.push({
							...hint,
							position: sourcePosition,
						});
						break;
					}
				}
			}
			return hints;
		}
		else {
			return provideInlayHints(fileName, span, preferences);
		}
	};
	languageService.getFileReferences = (fileName) => {
		const unresolved = getFileReferences(fileName);
		const resolved = unresolved
			.map(s => transformDocumentSpan(s, isReferencesEnabled))
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
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (filter(mapping.data)) {
					process(fileName, generateOffset + (isTsPlugin ? sourceFile.snapshot.getLength() : 0));
				}
			}
		}
		else {
			process(fileName, position);
		}

		return results;

		function process(fileName: string, position: number) {
			if (processedFilePositions.has(fileName + ':' + position))
				return;
			processedFilePositions.add(fileName + ':' + position);
			const result = worker(position);
			if (!result) return;
			results = results.concat(result);
			for (const ref of getLinkedCodes(result)) {

				processedFilePositions.add(ref[0] + ':' + ref[1]);

				const [virtualFile, sourceFile] = getVirtualFileAndMap(ref[0]);
				if (!virtualFile)
					continue;

				const linkedCodeMap = virtualFiles.getLinkedCodeMap(virtualFile);
				if (!linkedCodeMap)
					continue;

				for (const linkedCodeOffset of linkedCodeMap.getLinkedOffsets(ref[1] - (isTsPlugin ? sourceFile.snapshot.getLength() : 0))) {
					process(ref[0], linkedCodeOffset + (isTsPlugin ? sourceFile.snapshot.getLength() : 0));
				}
			}
		}
	}

	// transforms

	function transformCallHierarchyItem(item: ts.CallHierarchyItem, filter: (data: CodeInformation) => boolean): ts.CallHierarchyItem {
		const span = transformSpan(item.file, item.span, filter);
		const selectionSpan = transformSpan(item.file, item.selectionSpan, filter);
		return {
			...item,
			span: span?.textSpan ?? { start: 0, length: 0 },
			selectionSpan: selectionSpan?.textSpan ?? { start: 0, length: 0 },
		};
	}

	function transformDiagnostic<T extends ts.Diagnostic>(diagnostic: T): T | undefined {
		if (!transformedDiagnostics.has(diagnostic)) {
			if (diagnostic.start !== undefined && diagnostic.file) {
				transformedDiagnostics.set(diagnostic, undefined);
				const [virtualFile, sourceFile, map] = getVirtualFileAndMap(diagnostic.file?.fileName);
				if (virtualFile) {
					for (const [sourceOffset, mapping] of map.getSourceOffsets(diagnostic.start - (isTsPlugin ? sourceFile.snapshot.getLength() : 0))) {
						if (shouldReportDiagnostics(mapping.data)) {
							transformedDiagnostics.set(diagnostic, {
								...diagnostic,
								start: sourceOffset,
							});
							break;
						}
					}
				}
				else {
					transformedDiagnostics.set(diagnostic, diagnostic);
				}
			}
			else {
				transformedDiagnostics.set(diagnostic, diagnostic);
			}
			if (diagnostic.relatedInformation) {
				diagnostic.relatedInformation = diagnostic.relatedInformation
					.map(transformDiagnostic)
					.filter(notEmpty);
			}
		}
		return transformedDiagnostics.get(diagnostic) as T | undefined;
	}

	function transformFileTextChanges(changes: ts.FileTextChanges, filter: (data: CodeInformation) => boolean): ts.FileTextChanges | undefined {
		const [_, source] = getVirtualFileAndMap(changes.fileName);
		if (source) {
			return {
				...changes,
				fileName: source.id,
				textChanges: changes.textChanges.map(c => {
					const span = transformSpan(changes.fileName, c.span, filter);
					if (span) {
						return {
							...c,
							span: span.textSpan,
						};
					}
				}).filter(notEmpty),
			};
		}
		else {
			return changes;
		}
	}

	function transformDocumentSpan<T extends ts.DocumentSpan>(documentSpan: T, filter: (data: CodeInformation) => boolean, shouldFallback?: boolean): T | undefined {
		let textSpan = transformSpan(documentSpan.fileName, documentSpan.textSpan, filter);
		if (!textSpan && shouldFallback) {
			const [virtualFile, source] = getVirtualFileAndMap(documentSpan.fileName);
			if (virtualFile) {
				textSpan = {
					fileName: source.id,
					textSpan: { start: 0, length: 0 },
				};
			}
		}
		if (!textSpan) return;
		const contextSpan = transformSpan(documentSpan.fileName, documentSpan.contextSpan, filter);
		const originalTextSpan = transformSpan(documentSpan.originalFileName, documentSpan.originalTextSpan, filter);
		const originalContextSpan = transformSpan(documentSpan.originalFileName, documentSpan.originalContextSpan, filter);
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

	function transformSpan(fileName: string | undefined, textSpan: ts.TextSpan | undefined, filter: (data: CodeInformation) => boolean): {
		fileName: string;
		textSpan: ts.TextSpan;
	} | undefined {
		if (!fileName) return;
		if (!textSpan) return;
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const sourceStart of map.getSourceOffsets(textSpan.start - (isTsPlugin ? sourceFile.snapshot.getLength() : 0))) {
				if (filter(sourceStart[1].data)) {
					for (const sourceEnd of map.getSourceOffsets(textSpan.start + textSpan.length - (isTsPlugin ? sourceFile.snapshot.getLength() : 0))) {
						if (filter(sourceEnd[1].data)) {
							return {
								fileName: sourceFile.id,
								textSpan: {
									start: sourceStart[0],
									length: sourceEnd[0] - sourceStart[0],
								},
							};
						}
					}
				}
			}
		}
		else {
			return {
				fileName,
				textSpan,
			};
		}
	}

	function getVirtualFileAndMap(fileName: string) {
		if (isTsPlugin) {
			const sourceFile = virtualFiles.getSourceFile(fileName);
			if (sourceFile?.virtualFile) {
				for (const virtualFile of forEachEmbeddedFile(sourceFile.virtualFile[0])) {
					const ext = virtualFile.id.substring(fileName.length);
					if (virtualFile.typescript && (ext === '.d.ts' || ext.match(/^\.(js|ts)x?$/))) {
						for (const map of virtualFiles.getMaps(virtualFile)) {
							if (map[1][0] === sourceFile.snapshot) {
								return [virtualFile, sourceFile, map[1][1]] as const;
							}
						}
					}
				}
			}
		}
		else {
			const [virtualFile, sourceFile] = virtualFiles.getVirtualFile(fileName);
			if (virtualFile) {
				for (const map of virtualFiles.getMaps(virtualFile)) {
					if (map[1][0] === sourceFile.snapshot) {
						return [virtualFile, sourceFile, map[1][1]] as const;
					}
				}
			}
		}
		return [undefined, undefined, undefined] as const;
	}
}

function notEmpty<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}
