import type { VirtualFile } from '@volar/language-core';
import * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { LanguageServicePluginContext, LanguageServicePluginInstance } from '../types';
import { SourceMap } from '@volar/source-map';
import { isInsideRange, stringToSnapshot } from '../utils/common';

export function register(context: LanguageServicePluginContext) {

	return async (
		uri: string,
		options: vscode.FormattingOptions,
		range: vscode.Range | undefined,
		onTypeParams: {
			ch: string,
			position: vscode.Position,
		} | undefined,
		token = vscode.CancellationToken.None
	) => {

		let document = context.getTextDocument(uri);
		if (!document) return;

		range ??= vscode.Range.create(document.positionAt(0), document.positionAt(document.getText().length));

		const source = context.documents.getSourceByUri(document.uri);
		if (!source) {
			return onTypeParams
				? (await tryFormat(document, onTypeParams.position, onTypeParams.ch))?.edits
				: (await tryFormat(document, range, undefined))?.edits;
		}

		const initialIndentLanguageId = await context.configurationHost?.getConfiguration<Record<string, boolean>>('volar.format.initialIndent') ?? { html: true };
		const originalSnapshot = source.snapshot;
		const rootVirtualFile = source.root;
		const originalDocument = document;

		let level = 0;
		let edited = false;

		while (true) {

			const embeddedFiles = getEmbeddedFilesByLevel(rootVirtualFile, level++);
			if (embeddedFiles.length === 0)
				break;

			let edits: vscode.TextEdit[] = [];
			const toPatchIndentUris: {
				uri: string;
				isCodeBlock: boolean;
				plugin: LanguageServicePluginInstance;
			}[] = [];

			for (const embedded of embeddedFiles) {

				if (!embedded.capabilities.documentFormatting)
					continue;

				const isCodeBlock = embedded.mappings.length === 1 && embedded.mappings[0].generatedRange[0] === 0 && embedded.mappings[0].generatedRange[1] === embedded.snapshot.getLength();
				if (onTypeParams && !isCodeBlock)
					continue;

				const maps = [...context.documents.getMapsByVirtualFileName(embedded.fileName)];
				const map = maps.find(map => map[1].sourceFileDocument.uri === document!.uri)?.[1];
				if (!map)
					continue;

				let embeddedCodeResult: Awaited<ReturnType<typeof tryFormat>> | undefined;

				if (onTypeParams) {

					const embeddedPosition = map.toGeneratedPosition(onTypeParams.position);

					if (embeddedPosition) {
						embeddedCodeResult = await tryFormat(
							map.virtualFileDocument,
							embeddedPosition,
							onTypeParams.ch,
						);
					}
				}
				else {
					embeddedCodeResult = await tryFormat(map.virtualFileDocument, {
						start: map.virtualFileDocument.positionAt(0),
						end: map.virtualFileDocument.positionAt(map.virtualFileDocument.getText().length),
					});
				}

				if (!embeddedCodeResult)
					continue;

				toPatchIndentUris.push({
					uri: map.virtualFileDocument.uri,
					isCodeBlock,
					plugin: embeddedCodeResult.plugin,
				});

				for (const textEdit of embeddedCodeResult.edits) {
					const range = map.toSourceRange(textEdit.range);
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
				context.core.virtualFiles.updateSource(context.uriToFileName(document.uri), stringToSnapshot(document.getText()), undefined);
				edited = true;
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

				for (const toPatchIndentUri of toPatchIndentUris) {

					for (const [_, map] of context.documents.getMapsByVirtualFileUri(toPatchIndentUri.uri)) {

						const indentSensitiveLines = new Set<number>();

						for (const plugin of toPatchIndentUri.plugin.provideFormattingIndentSensitiveLines ? [toPatchIndentUri.plugin] : Object.values(context.plugins)) {

							if (token.isCancellationRequested)
								break;

							if (plugin.provideFormattingIndentSensitiveLines) {
								const lines = await plugin.provideFormattingIndentSensitiveLines(map.virtualFileDocument, token);
								if (lines) {
									for (const line of lines) {
										indentSensitiveLines.add(line);
									}
								}
							}
						}

						let indentEdits = patchIndents(
							document,
							toPatchIndentUri.isCodeBlock,
							map.map,
							initialIndentLanguageId[map.virtualFileDocument.languageId] ? baseIndent : '',
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
							context.core.virtualFiles.updateSource(context.uriToFileName(document.uri), stringToSnapshot(document.getText()), undefined);
							edited = true;
						}
					}
				}
			}
		}

		if (edited) {
			// recover
			context.core.virtualFiles.updateSource(context.uriToFileName(document.uri), originalSnapshot, undefined);
		}

		if (document.getText() === originalDocument.getText())
			return;

		const editRange = vscode.Range.create(
			originalDocument.positionAt(0),
			originalDocument.positionAt(originalDocument.getText().length),
		);
		const textEdit = vscode.TextEdit.replace(editRange, document.getText());

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

			for (const plugin of Object.values(context.plugins)) {

				if (token.isCancellationRequested)
					break;

				let edits: vscode.TextEdit[] | null | undefined;

				try {
					if (ch !== undefined && vscode.Position.is(formatRange)) {
						if (plugin.autoFormatTriggerCharacters?.includes(ch)) {
							edits = await plugin.provideOnTypeFormattingEdits?.(document, formatRange, ch, options, token);
						}
					}
					else if (ch === undefined && vscode.Range.is(formatRange)) {
						edits = await plugin.provideDocumentFormattingEdits?.(document, formatRange, options, token);
					}
				}
				catch (err) {
					console.warn(err);
				}

				if (!edits)
					continue;

				return {
					plugin,
					edits,
				};
			}
		}
	};
}

function patchIndents(document: TextDocument, isCodeBlock: boolean, map: SourceMap, initialIndent: string) {

	const indentTextEdits: vscode.TextEdit[] = [];

	if (!isCodeBlock) {
		initialIndent = '';
	}

	for (let i = 0; i < map.mappings.length; i++) {

		const mapping = map.mappings[i];
		const firstLineIndent = getBaseIndent(mapping.sourceRange[0]);
		const text = document.getText().substring(mapping.sourceRange[0], mapping.sourceRange[1]);
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
					start: document.positionAt(mapping.sourceRange[0]),
					end: document.positionAt(mapping.sourceRange[0]),
				},
			});
		}

		if (isCodeBlock && text.trimEnd().length === text.length) {
			indentTextEdits.push({
				newText: '\n',
				range: {
					start: document.positionAt(mapping.sourceRange[1]),
					end: document.positionAt(mapping.sourceRange[1]),
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
							start: document.positionAt(mapping.sourceRange[0] + lineOffset),
							end: document.positionAt(mapping.sourceRange[0] + lineOffset),
						},
					});
				}
				lineOffset += lines[i].length + 1;
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
