import { CodeInformation, FileProvider, forEachEmbeddedFile, isCodeActionsEnabled, isCodeLensEnabled, isCompletionEnabled, isDefinitionEnabled, isDiagnosticsEnabled, isHoverEnabled, isReferencesEnabled, shouldReportDiagnostics } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';

export function decorateLanguageService(virtualFiles: FileProvider, languageService: ts.LanguageService, isTsPlugin: boolean) {

	const transformedDiagnostics = new WeakMap<ts.Diagnostic, ts.Diagnostic | undefined>();
	const transformedDiagnosticWithLocations = new WeakMap<ts.DiagnosticWithLocation, ts.DiagnosticWithLocation | undefined>();

	const {
		organizeImports,
		getQuickInfoAtPosition,
		getCompletionsAtPosition,
		getCompletionEntryDetails,
		getDefinitionAndBoundSpan,
		findReferences,
		getDefinitionAtPosition,
		getTypeDefinitionAtPosition,
		getImplementationAtPosition,
		getFileReferences,
		findRenameLocations,
		getReferencesAtPosition,
		getSyntacticDiagnostics,
		getSemanticDiagnostics,
	} = languageService;

	languageService.organizeImports = (args, formatOptions, preferences) => {
		let edits: readonly ts.FileTextChanges[] = [];
		const sourceFile = virtualFiles.getSourceFile(args.fileName);
		if (sourceFile?.virtualFile) {
			for (const file of forEachEmbeddedFile(sourceFile.virtualFile[0])) {
				if (file.typescript && file.mappings.some(mapping => isCodeActionsEnabled(mapping.data))) {
					edits = edits.concat(organizeImports({
						...args,
						fileName: file.id,
					}, formatOptions, preferences));
				}
			}
		}
		else {
			return organizeImports(args, formatOptions, preferences);
		}
		return edits.map(edit => transformFileTextChanges(edit, isCodeLensEnabled)).filter(notEmpty);
	};
	languageService.getQuickInfoAtPosition = (fileName, position) => {
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (isHoverEnabled(mapping.data)) {
					const result = getQuickInfoAtPosition(fileName, sourceFile.snapshot.getLength() + generateOffset);
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
	languageService.getDefinitionAndBoundSpan = (fileName, position) => {

		const loopChecker = new Set<string>();
		let textSpan: ts.TextSpan | undefined;
		let symbols: ts.DefinitionInfo[] = [];

		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (isDefinitionEnabled(mapping.data)) {
					withLinkedCode(fileName, sourceFile.snapshot.getLength() + generateOffset);
				}
			}
		}
		else {
			withLinkedCode(fileName, position);
		}

		textSpan = transformSpan(fileName, textSpan, isDefinitionEnabled)?.textSpan;

		if (!textSpan) return;

		return {
			textSpan,
			definitions: symbols?.map(s => transformDocumentSpanLike(s, true, isDefinitionEnabled)).filter(notEmpty),
		};

		function withLinkedCode(fileName: string, position: number) {
			if (loopChecker.has(fileName + ':' + position))
				return;
			loopChecker.add(fileName + ':' + position);
			const _symbols = getDefinitionAndBoundSpan(fileName, position);
			if (!_symbols) return;
			if (!textSpan) {
				textSpan = _symbols.textSpan;
			}
			if (!_symbols.definitions) return;
			symbols = symbols.concat(_symbols.definitions);
			for (const ref of _symbols.definitions) {

				loopChecker.add(ref.fileName + ':' + ref.textSpan.start);

				const [virtualFile] = getVirtualFileAndMap(ref.fileName);
				if (!virtualFile)
					continue;

				const mirrorMap = virtualFiles.getMirrorMap(virtualFile);
				if (!mirrorMap)
					continue;

				for (const mirrorOffset of mirrorMap.toLinkedOffsets(ref.textSpan.start)) {
					if (loopChecker.has(ref.fileName + ':' + mirrorOffset))
						continue;
					withLinkedCode(ref.fileName, mirrorOffset);
				}
			}
		}
	};
	languageService.findReferences = (fileName, position) => {

		const loopChecker = new Set<string>();
		let symbols: ts.ReferencedSymbol[] = [];

		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (isReferencesEnabled(mapping.data)) {
					withLinkedCode(fileName, sourceFile.snapshot.getLength() + generateOffset);
				}
			}
		}
		else {
			withLinkedCode(fileName, position);
		}

		return symbols.map(s => transformReferencedSymbol(s, isReferencesEnabled)).filter(notEmpty);

		function withLinkedCode(fileName: string, position: number) {
			if (loopChecker.has(fileName + ':' + position))
				return;
			loopChecker.add(fileName + ':' + position);
			const _symbols = findReferences(fileName, position);
			if (!_symbols) return;
			symbols = symbols.concat(_symbols);
			for (const symbol of _symbols) {
				for (const ref of symbol.references) {

					loopChecker.add(ref.fileName + ':' + ref.textSpan.start);

					const [virtualFile] = getVirtualFileAndMap(ref.fileName);
					if (!virtualFile)
						continue;

					const mirrorMap = virtualFiles.getMirrorMap(virtualFile);
					if (!mirrorMap)
						continue;

					for (const mirrorOffset of mirrorMap.toLinkedOffsets(ref.textSpan.start)) {
						if (loopChecker.has(ref.fileName + ':' + mirrorOffset))
							continue;
						withLinkedCode(ref.fileName, mirrorOffset);
					}
				}
			}
		}
	};
	languageService.getSyntacticDiagnostics = (fileName) => {
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			if (map.codeMappings.some(mapping => isDiagnosticsEnabled(mapping.data))) {
				let result = getSyntacticDiagnostics(fileName);
				if (result) {
					result = result
						.map(diagnostic => {
							if (!transformedDiagnosticWithLocations.has(diagnostic)) {
								transformedDiagnosticWithLocations.set(diagnostic, undefined);
								let offset = diagnostic.start;
								if (isTsPlugin) {
									offset -= sourceFile.snapshot.getLength();
								}
								for (const [sourceOffset, mapping] of map.getSourceOffsets(offset)) {
									if (shouldReportDiagnostics(mapping.data)) {
										transformedDiagnosticWithLocations.set(diagnostic, {
											...diagnostic,
											start: sourceOffset,
										});
									}
								}
							}
							return transformedDiagnosticWithLocations.get(diagnostic);
						})
						.filter(notEmpty);
				}
				return result;
			}
			return [];
		}
		else {
			return getSyntacticDiagnostics(fileName);
		}
	};
	languageService.getSemanticDiagnostics = (fileName) => {
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			if (map.codeMappings.some(mapping => isDiagnosticsEnabled(mapping.data))) {
				let result = getSemanticDiagnostics(fileName);
				if (result) {
					result = result
						.map(diagnostic => {
							if (!transformedDiagnostics.has(diagnostic)) {
								transformedDiagnostics.set(diagnostic, undefined);
								if (diagnostic.start === undefined) {
									return diagnostic;
								}
								let offset = diagnostic.start;
								if (isTsPlugin) {
									offset -= sourceFile.snapshot.getLength();
								}
								for (const [sourceOffset, mapping] of map.getSourceOffsets(offset)) {
									if (shouldReportDiagnostics(mapping.data)) {
										transformedDiagnostics.set(diagnostic, {
											...diagnostic,
											start: sourceOffset,
										});
									}
								}
							}
							return transformedDiagnostics.get(diagnostic);
						})
						.filter(notEmpty);
				}
				return result;
			}
			return [];
		}
		else {
			return getSemanticDiagnostics(fileName);
		}
	};
	// findLocationsWorker
	languageService.getDefinitionAtPosition = (fileName, position) => {
		return findLocationsWorker(
			fileName,
			position,
			(fileName, position) => getDefinitionAtPosition(fileName, position),
			true
		);
	};
	languageService.getTypeDefinitionAtPosition = (fileName, position) => {
		return findLocationsWorker(
			fileName,
			position,
			(fileName, position) => getTypeDefinitionAtPosition(fileName, position),
			false
		);
	};
	languageService.getImplementationAtPosition = (fileName, position) => {
		return findLocationsWorker(
			fileName,
			position,
			(fileName, position) => getImplementationAtPosition(fileName, position),
			false
		);
	};
	languageService.getFileReferences = (fileName) => {
		return findLocationsWorker(
			fileName,
			-1,
			fileName => getFileReferences(fileName),
			false
		);
	};
	languageService.findRenameLocations = (fileName, position, findInStrings, findInComments, preferences) => {
		return findLocationsWorker(
			fileName,
			position,
			(fileName, position) => findRenameLocations(fileName, position, findInStrings, findInComments, preferences as ts.UserPreferences),
			false
		);
	};
	languageService.getReferencesAtPosition = (fileName, position) => {
		return findLocationsWorker(
			fileName,
			position,
			(fileName, position) => getReferencesAtPosition(fileName, position),
			false
		);
	};
	// not working
	languageService.getCompletionsAtPosition = (fileName, position, options, formattingSettings) => {
		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (isCompletionEnabled(mapping.data)) {
					const result = getCompletionsAtPosition(fileName, sourceFile.snapshot.getLength() + generateOffset, options, formattingSettings);
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

	// apis
	function findLocationsWorker<T extends ts.DocumentSpan>(
		fileName: string,
		position: number,
		worker: (fileName: string, position: number) => readonly T[] | undefined,
		isDefinition: boolean
	) {

		const loopChecker = new Set<string>();
		let symbols: T[] = [];

		const [virtualFile, sourceFile, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			for (const [generateOffset, mapping] of map.getGeneratedOffsets(position)) {
				if (mapping.data.navigation) {
					withLinkedCode(fileName, sourceFile.snapshot.getLength() + generateOffset);
				}
			}
		}
		else {
			withLinkedCode(fileName, position);
		}

		return symbols.map(s => transformDocumentSpanLike(s, isDefinition, data => !!data.navigation)).filter(notEmpty);

		function withLinkedCode(fileName: string, position: number) {
			if (loopChecker.has(fileName + ':' + position))
				return;
			loopChecker.add(fileName + ':' + position);
			const _symbols = worker(fileName, position);
			if (!_symbols) return;
			symbols = symbols.concat(_symbols);
			for (const ref of _symbols) {
				loopChecker.add(ref.fileName + ':' + ref.textSpan.start);

				const [virtualFile] = getVirtualFileAndMap(ref.fileName);
				if (!virtualFile)
					continue;

				const mirrorMap = virtualFiles.getMirrorMap(virtualFile);
				if (!mirrorMap)
					continue;

				for (const mirrorOffset of mirrorMap.toLinkedOffsets(ref.textSpan.start)) {
					if (loopChecker.has(ref.fileName + ':' + mirrorOffset))
						continue;
					withLinkedCode(ref.fileName, mirrorOffset);
				}
			}
		}
	}

	// transforms
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
		const definition = transformDocumentSpanLike(symbol.definition, false, filter);
		const references = symbol.references.map(r => transformDocumentSpanLike(r, false, filter)).filter(notEmpty);
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
	function transformDocumentSpanLike<T extends ts.DocumentSpan>(documentSpan: T, isDefinition: boolean, filter: (data: CodeInformation) => boolean): T | undefined {
		let textSpan = transformSpan(documentSpan.fileName, documentSpan.textSpan, filter);
		if (isDefinition && !textSpan) {
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
		const [virtualFile, source, map] = getVirtualFileAndMap(fileName);
		if (virtualFile) {
			if (isTsPlugin) {
				textSpan = {
					start: textSpan.start - source.snapshot.getLength(),
					length: textSpan.length,
				};
			}
			for (const sourceLoc of map.getSourceOffsets(textSpan.start)) {
				if (filter(sourceLoc[1].data)) {
					return {
						fileName: source.id,
						textSpan: {
							start: sourceLoc[0],
							length: textSpan.length,
						},
					};
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
