import { VirtualCode, forEachEmbeddedCode, isFormattingEnabled, resolveCommonLanguageId, updateVirtualCodeMaps } from '@volar/language-core';
import type * as ts from 'typescript';
import type * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SourceMapWithDocuments } from '../documents';
import type { EmbeddedCodeFormattingOptions, ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { findOverlapCodeRange, stringToSnapshot } from '../utils/common';
import { getEmbeddedFilesByLevel as getEmbeddedCodesByLevel } from '../utils/featureWorkers';

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

		const sourceFile = context.language.files.get(uri);
		if (!sourceFile) {
			return;
		}

		let document = context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);

		range ??= {
			start: document.positionAt(0),
			end: document.positionAt(document.getText().length),
		};

		if (!sourceFile.generated) {
			return onTypeParams
				? (await tryFormat(document, document, undefined, 0, onTypeParams.position, onTypeParams.ch))?.edits
				: (await tryFormat(document, document, undefined, 0, range, undefined))?.edits;
		}

		const embeddedRanges = new Map<string, { start: number, end: number; }>();
		const startOffset = document.offsetAt(range.start);
		const endOffset = document.offsetAt(range.end);

		for (const code of forEachEmbeddedCode(sourceFile.generated.code)) {
			for (const [sourceFileUri, [_snapshot, map]] of context.language.files.getMaps(code)) {
				if (sourceFileUri === uri) {
					const embeddedRange = findOverlapCodeRange(startOffset, endOffset, map, isFormattingEnabled);
					if (embeddedRange) {
						if (embeddedRange.start === map.mappings[0].generatedOffsets[0]) {
							embeddedRange.start = 0;
						}
						const lastMapping = map.mappings[map.mappings.length - 1];
						if (embeddedRange.end === lastMapping.generatedOffsets[lastMapping.generatedOffsets.length - 1] + lastMapping.lengths[lastMapping.lengths.length - 1]) {
							embeddedRange.end = code.snapshot.getLength();
						}
						embeddedRanges.set(code.id, embeddedRange);
					}
					break;
				}
			}
		}

		try {
			const originalDocument = document;

			let tempSourceSnapshot = sourceFile.snapshot;
			let tempVirtualFile = context.language.files.set(sourceFile.id + '.tmp', sourceFile.languageId, sourceFile.snapshot, [sourceFile.generated.languagePlugin]).generated?.code;
			if (!tempVirtualFile) {
				return;
			}

			let level = 0;

			while (true) {

				const embeddedCodes = getEmbeddedCodesByLevel(context, sourceFile.id, tempVirtualFile, level++);
				if (embeddedCodes.length === 0) {
					break;
				}

				let edits: vscode.TextEdit[] = [];

				for (const code of embeddedCodes) {

					if (!code.mappings.some(mapping => isFormattingEnabled(mapping.data))) {
						continue;
					}

					const docMap = createDocMap(code, uri, sourceFile.languageId, tempSourceSnapshot);
					if (!docMap) {
						continue;
					}

					let embeddedCodeResult: Awaited<ReturnType<typeof tryFormat>> | undefined;
					let embeddedRange = embeddedRanges.get(code.id);

					if (onTypeParams) {

						const embeddedPosition = docMap.getGeneratedPosition(onTypeParams.position);

						if (embeddedPosition) {
							embeddedCodeResult = await tryFormat(
								docMap.sourceDocument,
								docMap.embeddedDocument,
								code,
								level,
								embeddedPosition,
								onTypeParams.ch,
							);
						}
					}
					else if (embeddedRange) {
						embeddedCodeResult = await tryFormat(
							docMap.sourceDocument,
							docMap.embeddedDocument,
							code,
							level,
							{
								start: docMap.embeddedDocument.positionAt(embeddedRange.start),
								end: docMap.embeddedDocument.positionAt(embeddedRange.end),
							},
						);
					}

					if (!embeddedCodeResult) {
						continue;
					}

					for (const textEdit of embeddedCodeResult.edits) {
						const range = docMap.getSourceRange(textEdit.range);
						if (range) {
							edits.push({
								newText: textEdit.newText,
								range,
							});
						}
					}
				}

				if (edits.length > 0) {
					const newText = TextDocument.applyEdits(document, edits);
					document = TextDocument.create(document.uri, document.languageId, document.version + 1, newText);
					tempSourceSnapshot = stringToSnapshot(newText);
					tempVirtualFile = context.language.files.set(sourceFile.id + '.tmp', sourceFile.languageId, tempSourceSnapshot, [sourceFile.generated.languagePlugin]).generated?.code;
					if (!tempVirtualFile) {
						break;
					}
				}
			}

			if (document.getText() === originalDocument.getText()) {
				return;
			}

			const editRange: vscode.Range = {
				start: originalDocument.positionAt(0),
				end: originalDocument.positionAt(originalDocument.getText().length),
			};
			const textEdit: vscode.TextEdit = {
				range: editRange,
				newText: document.getText(),
			};

			return [textEdit];
		} finally {
			context.language.files.delete(sourceFile.id + '.tmp');
		}

		async function tryFormat(
			sourceDocument: TextDocument,
			document: TextDocument,
			code: VirtualCode | undefined,
			codeLevel: number,
			rangeOrPosition: vscode.Range | vscode.Position,
			ch?: string,
		) {

			if (context.disabledEmbeddedContentUris.has(document.uri)) {
				return;
			}

			let codeOptions: EmbeddedCodeFormattingOptions | undefined;

			rangeOrPosition ??= {
				start: document.positionAt(0),
				end: document.positionAt(document.getText().length),
			};

			if (code) {
				codeOptions = {
					level: codeLevel - 1,
					initialIndentLevel: 0,
				};
				if (code.mappings.length) {
					const firstMapping = code.mappings[0];
					const startOffset = firstMapping.sourceOffsets[0];
					const startPosition = sourceDocument.positionAt(startOffset);
					codeOptions.initialIndentLevel = computeInitialIndent(
						sourceDocument.getText(),
						sourceDocument.offsetAt({ line: startPosition.line, character: 0 }),
						options,
					);
				}
				for (const service of context.services) {
					if (context.disabledServicePlugins.has(service[1])) {
						continue;
					}
					codeOptions = await service[1].resolveEmbeddedCodeFormattingOptions?.(code, codeOptions, token) ?? codeOptions;
				}
			}

			for (const service of context.services) {
				if (context.disabledServicePlugins.has(service[1])) {
					continue;
				}

				if (token.isCancellationRequested) {
					break;
				}

				let edits: vscode.TextEdit[] | null | undefined;

				try {
					if (ch !== undefined && rangeOrPosition && 'line' in rangeOrPosition && 'character' in rangeOrPosition) {
						if (service[0].autoFormatTriggerCharacters?.includes(ch)) {
							edits = await service[1].provideOnTypeFormattingEdits?.(document, rangeOrPosition, ch, options, codeOptions, token);
						}
					}
					else if (ch === undefined && rangeOrPosition && 'start' in rangeOrPosition && 'end' in rangeOrPosition) {
						edits = await service[1].provideDocumentFormattingEdits?.(document, rangeOrPosition, options, codeOptions, token);
					}
				}
				catch (err) {
					console.warn(err);
				}

				if (!edits) {
					continue;
				}

				return {
					service,
					edits,
				};
			}
		}
	};

	function createDocMap(file: VirtualCode, sourceFileUri: string, sourceLanguageId: string, _sourceSnapshot: ts.IScriptSnapshot) {
		const maps = updateVirtualCodeMaps(file, sourceFileUri2 => {
			if (!sourceFileUri2) {
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
					context.documents.encodeEmbeddedContentUri(sourceFileUri, file.id),
					file.languageId,
					version,
					file.snapshot.getText(0, file.snapshot.getLength())
				),
				map[1],
			);
		}
	}
}

function computeInitialIndent(content: string, i: number, options: vscode.FormattingOptions) {
	let nChars = 0;
	const tabSize = options.tabSize || 4;
	while (i < content.length) {
		const ch = content.charAt(i);
		if (ch === ' ') {
			nChars++;
		} else if (ch === '\t') {
			nChars += tabSize;
		} else {
			break;
		}
		i++;
	}
	return Math.floor(nChars / tabSize);
}
