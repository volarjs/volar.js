import { SourceMap, VirtualFile, forEachEmbeddedFile, resolveCommonLanguageId, updateVirtualFileMaps } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { ServiceContext, Service } from '../types';
import { isInsideRange, stringToSnapshot } from '../utils/common';
import { NoneCancellationToken } from '../utils/cancellation';
import { SourceMapWithDocuments } from '../documents';
import type * as ts from 'typescript/lib/tsserverlibrary';

export function register(context: ServiceContext) {

	let fakeVersion = 0;

	return async (
		uri: string,
		options: vscode.FormattingOptions,
		range: vscode.Range | undefined,
		onTypeParams: {
			ch: string,
			position: vscode.Position,
		} | undefined,
		token = NoneCancellationToken
	) => {

		const sourceFile = context.project.fileProvider.getSourceFile(uri);
		if (!sourceFile)
			return;

		let document = context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);

		range ??= {
			start: document.positionAt(0),
			end: document.positionAt(document.getText().length),
		};

		if (!sourceFile.virtualFile) {
			return onTypeParams
				? (await tryFormat(document, onTypeParams.position, onTypeParams.ch))?.edits
				: (await tryFormat(document, range, undefined))?.edits;
		}

		const initialIndentLanguageId = await context.env.getConfiguration?.<Record<string, boolean>>('volar.format.initialIndent') ?? { html: true };

		let tempSourceSnapshot = sourceFile.snapshot;
		const tempVirtualFile = sourceFile.virtualFile[1].createVirtualFile(sourceFile.id, sourceFile.languageId, sourceFile.snapshot)!;
		const originalDocument = document;

		let level = 0;

		while (true) {

			const embeddedFiles = getEmbeddedFilesByLevel(tempVirtualFile, level++);
			if (embeddedFiles.length === 0)
				break;

			let edits: vscode.TextEdit[] = [];
			const toPatchIndent: {
				virtualFileUri: string;
				isCodeBlock: boolean;
				service: ReturnType<Service>;
			}[] = [];

			for (const file of embeddedFiles) {

				if (!file.mappings.some(mapping => mapping.data.formattingEdits ?? true))
					continue;

				const isCodeBlock = file.mappings.length === 1
					&& file.mappings[0].sourceOffsets.length === 1
					&& file.mappings[0].sourceOffsets[0] === 0
					&& file.mappings[0].lengths[0] === file.snapshot.getLength();
				if (onTypeParams && !isCodeBlock)
					continue;

				const docMap = createDocMap(file, sourceFile.id, sourceFile.languageId, tempSourceSnapshot);
				if (!docMap) continue;

				let embeddedCodeResult: Awaited<ReturnType<typeof tryFormat>> | undefined;

				if (onTypeParams) {

					const embeddedPosition = docMap.toGeneratedPosition(onTypeParams.position);

					if (embeddedPosition) {
						embeddedCodeResult = await tryFormat(
							docMap.virtualFileDocument,
							embeddedPosition,
							onTypeParams.ch,
						);
					}
				}
				else {
					embeddedCodeResult = await tryFormat(docMap.virtualFileDocument, {
						start: docMap.virtualFileDocument.positionAt(0),
						end: docMap.virtualFileDocument.positionAt(docMap.virtualFileDocument.getText().length),
					});
				}

				if (!embeddedCodeResult)
					continue;

				toPatchIndent.push({
					virtualFileUri: file.id,
					isCodeBlock,
					service: embeddedCodeResult.service,
				});

				for (const textEdit of embeddedCodeResult.edits) {
					const range = docMap.toSourceRange(textEdit.range);
					if (range) {
						edits.push({
							newText: textEdit.newText,
							range,
						});
					}
				}
			}

			edits = edits.filter(edit => isInsideRange(range!, edit.range));

			if (edits.length > 0) {
				const newText = TextDocument.applyEdits(document, edits);
				document = TextDocument.create(document.uri, document.languageId, document.version + 1, newText);
				tempSourceSnapshot = stringToSnapshot(newText);
				sourceFile.virtualFile[1].updateVirtualFile(tempVirtualFile, tempSourceSnapshot);
			}

			if (level > 1) {

				const baseIndent = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
				const editLines = new Set<number>();

				if (onTypeParams) {
					for (const edit of edits) {
						for (let line = edit.range.start.line; line <= edit.range.end.line; line++) {
							editLines.add(line);
						}
					}
				}

				for (const item of toPatchIndent) {

					let virtualFile!: VirtualFile;
					for (const file of forEachEmbeddedFile(tempVirtualFile)) {
						if (file.id === item.virtualFileUri) {
							virtualFile = file;
							break;
						}
					}
					const docMap = createDocMap(virtualFile, sourceFile.id, sourceFile.languageId, tempSourceSnapshot);
					if (!docMap) continue;

					const indentSensitiveLines = new Set<number>();

					for (const service of item.service.provideFormattingIndentSensitiveLines ? [item.service] : context.services) {

						if (token.isCancellationRequested)
							break;

						if (service.provideFormattingIndentSensitiveLines) {
							const lines = await service.provideFormattingIndentSensitiveLines(docMap.virtualFileDocument, token);
							if (lines) {
								for (const line of lines) {
									const sourceLine = docMap.toSourcePosition({ line: line, character: 0 })?.line;
									if (sourceLine !== undefined) {
										indentSensitiveLines.add(sourceLine);
									}
								}
							}
						}
					}

					let indentEdits = patchIndents(
						document,
						item.isCodeBlock,
						docMap.map,
						initialIndentLanguageId[docMap.virtualFileDocument.languageId] ? baseIndent : '',
					);

					indentEdits = indentEdits.filter(edit => {
						for (let line = edit.range.start.line; line <= edit.range.end.line; line++) {
							if (indentSensitiveLines.has(line) && !edit.newText.includes('\n')) {
								return false;
							}
							if (onTypeParams && !editLines.has(line)) {
								return false;
							}
							if (!isInsideRange(range!, edit.range)) {
								return false;
							}
						}
						return true;
					});

					if (indentEdits.length > 0) {
						const newText = TextDocument.applyEdits(document, indentEdits);
						document = TextDocument.create(document.uri, document.languageId, document.version + 1, newText);
						tempSourceSnapshot = stringToSnapshot(newText);
						sourceFile.virtualFile[1].updateVirtualFile(tempVirtualFile, tempSourceSnapshot);
					}
				}
			}
		}

		if (document.getText() === originalDocument.getText())
			return;

		const editRange: vscode.Range = {
			start: originalDocument.positionAt(0),
			end: originalDocument.positionAt(originalDocument.getText().length),
		};
		const textEdit: vscode.TextEdit = {
			range: editRange,
			newText: document.getText(),
		};

		return [textEdit];

		function getEmbeddedFilesByLevel(rootFile: VirtualFile, level: number) {

			const embeddedFilesByLevel: VirtualFile[][] = [[rootFile]];

			while (true) {

				if (embeddedFilesByLevel.length > level)
					return embeddedFilesByLevel[level];

				let nextLevel: VirtualFile[] = [];

				for (const file of embeddedFilesByLevel[embeddedFilesByLevel.length - 1]) {
					nextLevel = nextLevel.concat(file.embeddedFiles);
				}

				embeddedFilesByLevel.push(nextLevel);
			}
		}

		async function tryFormat(
			document: TextDocument,
			range: vscode.Range | vscode.Position,
			ch?: string,
		) {

			let formatRange = range;

			for (const service of context.services) {

				if (token.isCancellationRequested)
					break;

				let edits: vscode.TextEdit[] | null | undefined;

				try {
					if (ch !== undefined && 'line' in formatRange && 'character' in formatRange) {
						if (service.autoFormatTriggerCharacters?.includes(ch)) {
							edits = await service.provideOnTypeFormattingEdits?.(document, formatRange, ch, options, token);
						}
					}
					else if (ch === undefined && 'start' in formatRange && 'end' in formatRange) {
						edits = await service.provideDocumentFormattingEdits?.(document, formatRange, options, token);
					}
				}
				catch (err) {
					console.warn(err);
				}

				if (!edits)
					continue;

				return {
					service,
					edits,
				};
			}
		}
	};

	function createDocMap(file: VirtualFile, sourceFileUri: string, sourceLanguageId: string, _sourceSnapshot: ts.IScriptSnapshot) {
		const maps = updateVirtualFileMaps(file, (sourceFileName) => {
			if (!sourceFileName) {
				return [sourceFileUri, _sourceSnapshot];
			}
		});
		if (maps.has(sourceFileUri) && maps.get(sourceFileUri)![0] === _sourceSnapshot) {
			const map = maps.get(sourceFileUri)!;
			const version = fakeVersion++;
			return new SourceMapWithDocuments(
				TextDocument.create(
					sourceFileUri,
					sourceLanguageId ?? resolveCommonLanguageId(sourceFileUri),
					version,
					_sourceSnapshot.getText(0, _sourceSnapshot.getLength())
				),
				TextDocument.create(
					file.id,
					file.languageId,
					version,
					file.snapshot.getText(0, file.snapshot.getLength())
				),
				map[1],
			);
		}
	}
}

function patchIndents(document: TextDocument, isCodeBlock: boolean, map: SourceMap, initialIndent: string) {

	const indentTextEdits: vscode.TextEdit[] = [];

	if (!isCodeBlock) {
		initialIndent = '';
	}

	for (let i = 0; i < map.codeMappings.length; i++) {

		const mapping = map.codeMappings[i];

		for (let j = 0; j < mapping.sourceOffsets.length; j++) {

			const firstLineIndent = getBaseIndent(mapping.sourceOffsets[j]);
			const text = document.getText().substring(mapping.sourceOffsets[j], mapping.sourceOffsets[j] + mapping.lengths[j]);
			const lines = text.split('\n');
			const baseIndent = firstLineIndent + initialIndent;
			let lineOffset = lines[0].length + 1;
			let insertedFinalNewLine = false;

			if (!text.trim())
				continue;

			if (isCodeBlock && text.trimStart().length === text.length) {
				indentTextEdits.push({
					newText: '\n' + baseIndent,
					range: {
						start: document.positionAt(mapping.sourceOffsets[j]),
						end: document.positionAt(mapping.sourceOffsets[j]),
					},
				});
			}

			if (isCodeBlock && text.trimEnd().length === text.length) {
				indentTextEdits.push({
					newText: '\n',
					range: {
						start: document.positionAt(mapping.sourceOffsets[j] + mapping.lengths[j]),
						end: document.positionAt(mapping.sourceOffsets[j] + mapping.lengths[j]),
					},
				});
				insertedFinalNewLine = true;
			}

			if (baseIndent && lines.length > 1) {
				for (let i = 1; i < lines.length; i++) {
					if (lines[i].trim() || i === lines.length - 1) {
						const isLastLine = i === lines.length - 1 && !insertedFinalNewLine;
						indentTextEdits.push({
							newText: isLastLine ? firstLineIndent : baseIndent,
							range: {
								start: document.positionAt(mapping.sourceOffsets[j] + lineOffset),
								end: document.positionAt(mapping.sourceOffsets[j] + lineOffset),
							},
						});
					}
					lineOffset += lines[i].length + 1;
				}
			}
		}
	}

	return indentTextEdits;

	function getBaseIndent(pos: number) {
		const startPos = document.positionAt(pos);
		const startLineText = document.getText({ start: { line: startPos.line, character: 0 }, end: startPos });
		return startLineText.substring(0, startLineText.length - startLineText.trimStart().length);
	}
}
