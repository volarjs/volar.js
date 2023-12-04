import {
	CodeInformation,
	FileProvider,
	forEachEmbeddedFile,
	isCodeActionsEnabled,
	isCodeLensEnabled,
	isCompletionEnabled,
	isDefinitionEnabled,
	isHoverEnabled,
	isImplementationEnabled,
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
		organizeImports,
	} = languageService;

	languageService.organizeImports = (args, formatOptions, preferences) => {
		const unresolved = organizeImports(args, formatOptions, preferences);
		const resolved = unresolved.map(change => {
			return {
				...change,
				textChanges: change.textChanges = change.textChanges
					.map(edit => {
						const span = transformSpan(change.fileName, edit.span, isCodeActionsEnabled)?.textSpan;
						if (span) {
							return {
								...edit,
								span,
							};
						}
					})
					.filter(notEmpty),
			};
		});
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
	languageService.getEncodedSemanticClassifications = (fileName, span, format) => {
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			let start: number | undefined;
			let end: number | undefined;
			for (const mapping of map.codeMappings) {
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
			.map(s => transformReferencedSymbol(s, isReferencesEnabled))
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
	languageService.getFileReferences = (fileName) => {
		const unresolved = getFileReferences(fileName);
		const resolved = unresolved
			.map(s => transformDocumentSpan(s, isReferencesEnabled))
			.filter(notEmpty);
		return dedupeDocumentSpans(resolved);
	};
	// not working
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

				const linkedCodeMap = virtualFiles.getMirrorMap(virtualFile);
				if (!linkedCodeMap)
					continue;

				for (const linkedCodeOffset of linkedCodeMap.toLinkedOffsets(ref[1] - (isTsPlugin ? sourceFile.snapshot.getLength() : 0))) {
					process(ref[0], linkedCodeOffset + (isTsPlugin ? sourceFile.snapshot.getLength() : 0));
				}
			}
		}
	}

	// transforms
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
	function transformReferencedSymbol(symbol: ts.ReferencedSymbol, filter: (data: CodeInformation) => boolean): ts.ReferencedSymbol | undefined {
		const definition = transformDocumentSpan(symbol.definition, filter);
		const references = symbol.references.map(r => transformDocumentSpan(r, filter)).filter(notEmpty);
		if (definition) {
			return {
				definition,
				references,
			};
		}
		else if (references.length) { // TODO: remove patching
			return {
				definition: {
					...symbol.definition,
					fileName: references[0].fileName,
					textSpan: references[0].textSpan,
				},
				references,
			};
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
