import { FileKind, VirtualFile, FileProvider, forEachEmbeddedFile } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';

export function decorateLanguageService(virtualFiles: FileProvider, languageService: ts.LanguageService, isTsPlugin: boolean) {

	const _organizeImports = languageService.organizeImports.bind(languageService);
	const _getDefinitionAtPosition = languageService.getDefinitionAtPosition.bind(languageService);
	const _getDefinitionAndBoundSpan = languageService.getDefinitionAndBoundSpan.bind(languageService);
	const _getTypeDefinitionAtPosition = languageService.getTypeDefinitionAtPosition.bind(languageService);
	const _getImplementationAtPosition = languageService.getImplementationAtPosition.bind(languageService);
	const _getFileReferences = languageService.getFileReferences.bind(languageService);
	const _findRenameLocations = languageService.findRenameLocations.bind(languageService);
	const _getReferencesAtPosition = languageService.getReferencesAtPosition.bind(languageService);
	const _findReferences = languageService.findReferences.bind(languageService);

	languageService.organizeImports = organizeImports;
	languageService.getDefinitionAtPosition = getDefinitionAtPosition;
	languageService.getDefinitionAndBoundSpan = getDefinitionAndBoundSpan;
	languageService.getTypeDefinitionAtPosition = getTypeDefinitionAtPosition;
	languageService.getImplementationAtPosition = getImplementationAtPosition;
	languageService.findRenameLocations = findRenameLocations;
	languageService.getReferencesAtPosition = getReferencesAtPosition;
	languageService.getFileReferences = getFileReferences;
	languageService.findReferences = findReferences;

	// apis
	function organizeImports(args: ts.OrganizeImportsArgs, formatOptions: ts.FormatCodeSettings, preferences: ts.UserPreferences | undefined): ReturnType<ts.LanguageService['organizeImports']> {
		let edits: readonly ts.FileTextChanges[] = [];
		const sourceFile = virtualFiles.getSourceFile(args.fileName);
		if (sourceFile?.root) {
			for (const file of forEachEmbeddedFile(sourceFile.root)) {
				if (file.kind === FileKind.TypeScriptHostFile && file.mappings.some(mapping => mapping.data.codeActions)) {
					edits = edits.concat(_organizeImports({
						...args,
						fileName: file.id,
					}, formatOptions, preferences));
				}
			}
		}
		else {
			return _organizeImports(args, formatOptions, preferences);
		}
		return edits.map(transformFileTextChanges).filter(notEmpty);
	}
	function getReferencesAtPosition(fileName: string, position: number): ReturnType<ts.LanguageService['getReferencesAtPosition']> {
		return findLocations(fileName, position, 'references') as ts.ReferenceEntry[];
	}
	function getFileReferences(fileName: string): ReturnType<ts.LanguageService['getFileReferences']> {
		return findLocations(fileName, -1, 'fileReferences') as ts.ReferenceEntry[];
	}
	function getDefinitionAtPosition(fileName: string, position: number): ReturnType<ts.LanguageService['getDefinitionAtPosition']> {
		return findLocations(fileName, position, 'definition') as ts.DefinitionInfo[];
	}
	function getTypeDefinitionAtPosition(fileName: string, position: number): ReturnType<ts.LanguageService['getDefinitionAtPosition']> {
		return findLocations(fileName, position, 'typeDefinition') as ts.DefinitionInfo[];
	}
	function getImplementationAtPosition(fileName: string, position: number): ReturnType<ts.LanguageService['getImplementationAtPosition']> {
		return findLocations(fileName, position, 'implementation') as ts.ImplementationLocation[];
	}
	function findRenameLocations(fileName: string, position: number, findInStrings: boolean, findInComments: boolean, preferences: ts.UserPreferences | boolean | undefined): ReturnType<ts.LanguageService['findRenameLocations']> {
		return findLocations(fileName, position, 'rename', findInStrings, findInComments, preferences as ts.UserPreferences) as ts.RenameLocation[];
	}
	function findLocations(
		fileName: string,
		position: number,
		mode: 'definition' | 'typeDefinition' | 'references' | 'fileReferences' | 'implementation' | 'rename',
		findInStrings = false,
		findInComments = false,
		preferences?: ts.UserPreferences
	) {

		const loopChecker = new Set<string>();
		let symbols: (ts.DefinitionInfo | ts.ReferenceEntry | ts.ImplementationLocation | ts.RenameLocation)[] = [];

		withMirrors(fileName, position);

		return symbols.map(s => transformDocumentSpanLike(s, mode === 'definition')).filter(notEmpty);

		function withMirrors(fileName: string, position: number) {
			if (loopChecker.has(fileName + ':' + position))
				return;
			loopChecker.add(fileName + ':' + position);
			const _symbols = mode === 'definition' ? _getDefinitionAtPosition(fileName, position)
				: mode === 'typeDefinition' ? _getTypeDefinitionAtPosition(fileName, position)
					: mode === 'references' ? _getReferencesAtPosition(fileName, position)
						: mode === 'fileReferences' ? _getFileReferences(fileName)
							: mode === 'implementation' ? _getImplementationAtPosition(fileName, position)
								: mode === 'rename' && preferences ? _findRenameLocations(fileName, position, findInStrings, findInComments, preferences)
									: undefined;
			if (!_symbols) return;
			symbols = symbols.concat(_symbols);
			for (const ref of _symbols) {
				loopChecker.add(ref.fileName + ':' + ref.textSpan.start);

				const [virtualFile] = getVirtualFile(ref.fileName);
				if (!virtualFile)
					continue;

				const mirrorMap = virtualFiles.getMirrorMap(virtualFile);
				if (!mirrorMap)
					continue;

				for (const [mirrorOffset, data] of mirrorMap.findMirrorOffsets(ref.textSpan.start)) {
					if ((mode === 'definition' || mode === 'typeDefinition' || mode === 'implementation') && !data.definition)
						continue;
					if ((mode === 'references') && !data.references)
						continue;
					if ((mode === 'rename') && !data.rename)
						continue;
					if (loopChecker.has(ref.fileName + ':' + mirrorOffset))
						continue;
					withMirrors(ref.fileName, mirrorOffset);
				}
			}
		}
	}
	function getDefinitionAndBoundSpan(fileName: string, position: number): ReturnType<ts.LanguageService['getDefinitionAndBoundSpan']> {

		const loopChecker = new Set<string>();
		let textSpan: ts.TextSpan | undefined;
		let symbols: ts.DefinitionInfo[] = [];

		withMirrors(fileName, position);

		if (!textSpan) return;
		return {
			textSpan: textSpan,
			definitions: symbols?.map(s => transformDocumentSpanLike(s, true)).filter(notEmpty),
		};

		function withMirrors(fileName: string, position: number) {
			if (loopChecker.has(fileName + ':' + position))
				return;
			loopChecker.add(fileName + ':' + position);
			const _symbols = _getDefinitionAndBoundSpan(fileName, position);
			if (!_symbols) return;
			if (!textSpan) {
				textSpan = _symbols.textSpan;
			}
			if (!_symbols.definitions) return;
			symbols = symbols.concat(_symbols.definitions);
			for (const ref of _symbols.definitions) {

				loopChecker.add(ref.fileName + ':' + ref.textSpan.start);

				const [virtualFile] = getVirtualFile(ref.fileName);
				if (!virtualFile)
					continue;

				const mirrorMap = virtualFiles.getMirrorMap(virtualFile);
				if (!mirrorMap)
					continue;

				for (const [mirrorOffset, data] of mirrorMap.findMirrorOffsets(ref.textSpan.start)) {
					if (!data.definition)
						continue;
					if (loopChecker.has(ref.fileName + ':' + mirrorOffset))
						continue;
					withMirrors(ref.fileName, mirrorOffset);
				}
			}
		}
	}
	function findReferences(fileName: string, position: number): ReturnType<ts.LanguageService['findReferences']> {

		const loopChecker = new Set<string>();
		let symbols: ts.ReferencedSymbol[] = [];

		withMirrors(fileName, position);

		return symbols.map(s => transformReferencedSymbol(s)).filter(notEmpty);

		function withMirrors(fileName: string, position: number) {
			if (loopChecker.has(fileName + ':' + position))
				return;
			loopChecker.add(fileName + ':' + position);
			const _symbols = _findReferences(fileName, position);
			if (!_symbols) return;
			symbols = symbols.concat(_symbols);
			for (const symbol of _symbols) {
				for (const ref of symbol.references) {

					loopChecker.add(ref.fileName + ':' + ref.textSpan.start);

					const [virtualFile] = getVirtualFile(ref.fileName);
					if (!virtualFile)
						continue;

					const mirrorMap = virtualFiles.getMirrorMap(virtualFile);
					if (!mirrorMap)
						continue;

					for (const [mirrorOffset, data] of mirrorMap.findMirrorOffsets(ref.textSpan.start)) {
						if (!data.references)
							continue;
						if (loopChecker.has(ref.fileName + ':' + mirrorOffset))
							continue;
						withMirrors(ref.fileName, mirrorOffset);
					}
				}
			}
		}
	}

	// transforms
	function transformFileTextChanges(changes: ts.FileTextChanges): ts.FileTextChanges | undefined {
		const [_, source] = getVirtualFile(changes.fileName);
		if (source) {
			return {
				...changes,
				fileName: source.id,
				textChanges: changes.textChanges.map(c => {
					const span = transformSpan(changes.fileName, c.span);
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
	function transformReferencedSymbol(symbol: ts.ReferencedSymbol): ts.ReferencedSymbol | undefined {
		const definition = transformDocumentSpanLike(symbol.definition, false);
		const references = symbol.references.map(r => transformDocumentSpanLike(r, false)).filter(notEmpty);
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
	function transformDocumentSpanLike<T extends ts.DocumentSpan>(documentSpan: T, isDefinition: boolean): T | undefined {
		let textSpan = transformSpan(documentSpan.fileName, documentSpan.textSpan);
		if (isDefinition && !textSpan) {
			const [virtualFile, source] = getVirtualFile(documentSpan.fileName);
			if (virtualFile && source) {
				textSpan = {
					fileName: source.id,
					textSpan: { start: 0, length: 0 },
				};
			}
		}
		if (!textSpan) return;
		const contextSpan = transformSpan(documentSpan.fileName, documentSpan.contextSpan);
		const originalTextSpan = transformSpan(documentSpan.originalFileName, documentSpan.originalTextSpan);
		const originalContextSpan = transformSpan(documentSpan.originalFileName, documentSpan.originalContextSpan);
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
	function transformSpan(fileName: string | undefined, textSpan: ts.TextSpan | undefined) {
		if (!fileName) return;
		if (!textSpan) return;
		const [virtualFile, source] = getVirtualFile(fileName);
		if (virtualFile && source) {
			if (isTsPlugin) {
				textSpan = {
					start: textSpan.start - source.snapshot.getLength(),
					length: textSpan.length,
				};
			}
			for (const [_, [sourceSnapshot, map]] of virtualFiles.getMaps(virtualFile)) {

				if (source.snapshot !== sourceSnapshot)
					continue;

				const sourceLoc = map.toSourceOffset(textSpan.start);
				if (sourceLoc) {
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

	function getVirtualFile(fileName: string) {
		if (isTsPlugin) {
			let result: VirtualFile | undefined;
			const sourceFile = virtualFiles.getSourceFile(fileName);
			if (sourceFile?.root) {
				for (const virtualFile of forEachEmbeddedFile(sourceFile.root)) {
					const ext = virtualFile.id.substring(fileName.length);
					if (virtualFile.kind === FileKind.TypeScriptHostFile && (ext === '.d.ts' || ext.match(/^\.(js|ts)x?$/))) {
						result = virtualFile;
					}
				}
			}
			return [result, sourceFile] as const;
		}
		else {
			return virtualFiles.getVirtualFile(fileName);
		}
	}
}

function notEmpty<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}
