import { isDocumentLinkEnabled, isRenameEnabled, resolveRenameEditText, type CodeInformation } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { ServiceContext } from '../types';
import { notEmpty } from './common';

export function transformDocumentLinkTarget(_target: string, context: ServiceContext) {
	let target = URI.parse(_target);
	const decoded = context.decodeEmbeddedDocumentUri(target);
	if (!decoded) {
		return target;
	}

	target = decoded[0];
	const sourceScript = context.language.scripts.get(target);
	const virtualCode = sourceScript?.generated?.embeddedCodes.get(decoded[1]);

	if (virtualCode) {
		for (const map of context.documents.getMaps(virtualCode)) {

			if (!map.map.mappings.some(mapping => isDocumentLinkEnabled(mapping.data))) {
				continue;
			}

			target = URI.parse(map.sourceDocument.uri);

			const hash = target.fragment;
			const range = hash.match(/^L(\d+)(,(\d+))?(-L(\d+)(,(\d+))?)?$/);

			if (range) {
				const startLine = Number(range[1]) - 1;
				const startCharacter = Number(range[3] ?? 1) - 1;
				if (range[5] !== undefined) {
					const endLine = Number(range[5]) - 1;
					const endCharacter = Number(range[7] ?? 1) - 1;
					const sourceRange = map.getSourceRange({
						start: { line: startLine, character: startCharacter },
						end: { line: endLine, character: endCharacter },
					});
					if (sourceRange) {
						target = target.with({
							fragment: 'L' + (sourceRange.start.line + 1) + ',' + (sourceRange.start.character + 1)
								+ '-L' + (sourceRange.end.line + 1) + ',' + (sourceRange.end.character + 1),
						});
						break;
					}
				}
				else {
					const sourcePos = map.getSourcePosition({ line: startLine, character: startCharacter });
					if (sourcePos) {
						target = target.with({
							fragment: 'L' + (sourcePos.line + 1) + ',' + (sourcePos.character + 1),
						});
						break;
					}
				}
			}
		}
	}

	return target;
}

export function transformMarkdown(content: string, context: ServiceContext) {
	return content.replace(/(?!\()volar-embedded-content:\/\/\w+\/[^)]+/g, match => {
		const segments = match.split('|');
		segments[0] = transformDocumentLinkTarget(segments[0], context).toString();
		return segments.join('|');
	});
}

export function transformCompletionItem<T extends vscode.CompletionItem>(
	item: T,
	getOtherRange: (range: vscode.Range) => vscode.Range | undefined,
	document: vscode.TextDocument,
	context: ServiceContext
): T {
	return {
		...item,
		additionalTextEdits: item.additionalTextEdits
			?.map(edit => transformTextEdit(edit, getOtherRange, document))
			.filter(notEmpty),
		textEdit: item.textEdit
			? transformTextEdit(item.textEdit, getOtherRange, document)
			: undefined,
		documentation:
			item.documentation ?
				typeof item.documentation === 'string' ? transformMarkdown(item.documentation, context) :
					item.documentation.kind === 'markdown' ?
						{ kind: 'markdown', value: transformMarkdown(item.documentation.value, context) }
						: item.documentation
				: undefined
	};
}

export function transformCompletionList<T extends vscode.CompletionList>(
	completionList: T,
	getOtherRange: (range: vscode.Range) => vscode.Range | undefined,
	document: TextDocument,
	context: ServiceContext,
): T {
	return {
		isIncomplete: completionList.isIncomplete,
		itemDefaults: completionList.itemDefaults ? {
			...completionList.itemDefaults,
			editRange: completionList.itemDefaults.editRange
				? 'replace' in completionList.itemDefaults.editRange
					? {
						insert: getOtherRange(completionList.itemDefaults.editRange.insert),
						replace: getOtherRange(completionList.itemDefaults.editRange.replace),
					}
					: getOtherRange(completionList.itemDefaults.editRange)
				: undefined,
		} : undefined,
		items: completionList.items.map(item => transformCompletionItem(item, getOtherRange, document, context)),
	} as T;
}

export function transformDocumentSymbol(symbol: vscode.DocumentSymbol, getOtherRange: (range: vscode.Range) => vscode.Range | undefined): vscode.DocumentSymbol | undefined {
	const range = getOtherRange(symbol.range);
	if (!range) {
		return;
	}
	const selectionRange = getOtherRange(symbol.selectionRange);
	if (!selectionRange) {
		return;
	}
	return {
		...symbol,
		range,
		selectionRange,
		children: symbol.children
			?.map(child => transformDocumentSymbol(child, getOtherRange))
			.filter(notEmpty),
	};
}

export function transformFoldingRanges(ranges: vscode.FoldingRange[], getOtherRange: (range: vscode.Range) => vscode.Range | undefined): vscode.FoldingRange[] {

	const result: vscode.FoldingRange[] = [];

	for (const range of ranges) {
		const otherRange = getOtherRange({
			start: { line: range.startLine, character: range.startCharacter ?? 0 },
			end: { line: range.endLine, character: range.endCharacter ?? 0 },
		});
		if (otherRange) {
			range.startLine = otherRange.start.line;
			range.endLine = otherRange.end.line;
			if (range.startCharacter !== undefined) {
				range.startCharacter = otherRange.start.character;
			}
			if (range.endCharacter !== undefined) {
				range.endCharacter = otherRange.end.character;
			}
			result.push(range);
		}
	}

	return result;
}

export function transformHover<T extends vscode.Hover>(hover: T, getOtherRange: (range: vscode.Range) => vscode.Range | undefined): T | undefined {

	if (!hover?.range) {
		return hover;
	}

	const range = getOtherRange(hover.range);
	if (!range) {
		return;
	}

	return {
		...hover,
		range,
	};
}

export function transformLocation<T extends { range: vscode.Range; }>(location: T, getOtherRange: (range: vscode.Range) => vscode.Range | undefined): T | undefined {

	const range = getOtherRange(location.range);
	if (!range) {
		return;
	}

	return {
		...location,
		range,
	};
}

export function transformLocations<T extends { range: vscode.Range; }>(locations: T[], getOtherRange: (range: vscode.Range) => vscode.Range | undefined): T[] {
	return locations
		.map(location => transformLocation(location, getOtherRange))
		.filter(notEmpty);
}

export function transformSelectionRange<T extends vscode.SelectionRange>(location: T, getOtherRange: (range: vscode.Range) => vscode.Range | undefined): T | undefined {

	const range = getOtherRange(location.range);
	if (!range) {
		return;
	}

	const parent = location.parent ? transformSelectionRange(location.parent as T, getOtherRange) : undefined;

	return {
		range,
		parent,
	} as T;
}

export function transformSelectionRanges<T extends vscode.SelectionRange>(locations: T[], getOtherRange: (range: vscode.Range) => vscode.Range | undefined): T[] {
	return locations
		.map(location => transformSelectionRange(location, getOtherRange))
		.filter(notEmpty);
}

export function transformTextEdit<T extends vscode.TextEdit | vscode.InsertReplaceEdit>(
	textEdit: T,
	getOtherRange: (range: vscode.Range) => vscode.Range | undefined,
	document: vscode.TextDocument,
): T | undefined {
	if ('range' in textEdit) {

		let range = getOtherRange(textEdit.range);
		if (range) {
			return {
				...textEdit,
				range,
			};
		};

		const cover = tryRecoverTextEdit(getOtherRange, textEdit.range, textEdit.newText, document);
		if (cover) {
			return {
				...textEdit,
				range: cover.range,
				newText: cover.newText,
			};
		}
	}
	else if ('replace' in textEdit && 'insert' in textEdit) {

		const insert = getOtherRange(textEdit.insert);
		const replace = insert ? getOtherRange(textEdit.replace) : undefined;
		if (insert && replace) {
			return {
				...textEdit,
				insert,
				replace,
			};
		}

		const recoverInsert = tryRecoverTextEdit(getOtherRange, textEdit.insert, textEdit.newText, document);
		const recoverReplace = recoverInsert ? tryRecoverTextEdit(getOtherRange, textEdit.replace, textEdit.newText, document) : undefined;
		if (recoverInsert && recoverReplace && recoverInsert.newText === recoverReplace.newText) {
			return {
				...textEdit,
				insert: recoverInsert.range,
				replace: recoverReplace.range,
				newText: recoverInsert.newText,
			};
		}
	}
}

/**
 * update edit text from ". foo" to " foo"
 * fix https://github.com/johnsoncodehk/volar/issues/2155
 */
function tryRecoverTextEdit(
	getOtherRange: (range: vscode.Range) => vscode.Range | undefined,
	replaceRange: vscode.Range,
	newText: string,
	document: vscode.TextDocument,
): vscode.TextEdit | undefined {
	if (replaceRange.start.line === replaceRange.end.line && replaceRange.end.character > replaceRange.start.character) {

		let character = replaceRange.start.character;

		while (newText.length && replaceRange.end.character > character) {
			const newStart = { line: replaceRange.start.line, character: replaceRange.start.character + 1 };
			if (document.getText({ start: replaceRange.start, end: newStart }) === newText[0]) {
				newText = newText.slice(1);
				character++;
				const otherRange = getOtherRange({ start: newStart, end: replaceRange.end });
				if (otherRange) {
					return {
						newText,
						range: otherRange,
					};
				}
			}
			else {
				break;
			}
		}
	}
}

export function transformWorkspaceSymbol(symbol: vscode.WorkspaceSymbol, getOtherLocation: (location: vscode.Location) => vscode.Location | undefined): vscode.WorkspaceSymbol | undefined {
	if (!('range' in symbol.location)) {
		return symbol;
	}
	const loc = getOtherLocation(symbol.location);
	if (!loc) {
		return;
	}
	return {
		...symbol,
		location: loc,
	};
}

export function transformWorkspaceEdit(
	edit: vscode.WorkspaceEdit,
	context: ServiceContext,
	mode: 'fileName' | 'rename' | 'codeAction' | undefined,
	versions: Record<string, number> = {},
) {

	const sourceResult: vscode.WorkspaceEdit = {};
	let hasResult = false;

	for (const tsUri in edit.changeAnnotations) {

		sourceResult.changeAnnotations ??= {};

		const tsAnno = edit.changeAnnotations[tsUri];
		const decoded = context.decodeEmbeddedDocumentUri(URI.parse(tsUri));
		const sourceScript = decoded && context.language.scripts.get(decoded[0]);
		const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

		if (virtualCode) {
			for (const map of context.documents.getMaps(virtualCode)) {
				// TODO: check capability?
				const uri = map.sourceDocument.uri;
				sourceResult.changeAnnotations[uri] = tsAnno;
			}
		}
		else {
			sourceResult.changeAnnotations[tsUri] = tsAnno;
		}
	}
	for (const tsUri in edit.changes) {

		sourceResult.changes ??= {};

		const decoded = context.decodeEmbeddedDocumentUri(URI.parse(tsUri));
		const sourceScript = decoded && context.language.scripts.get(decoded[0]);
		const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

		if (virtualCode) {
			for (const map of context.documents.getMaps(virtualCode)) {
				const tsEdits = edit.changes[tsUri];
				for (const tsEdit of tsEdits) {
					if (mode === 'rename' || mode === 'fileName' || mode === 'codeAction') {

						let _data!: CodeInformation;

						const range = map.getSourceRange(tsEdit.range, data => {
							_data = data;
							return isRenameEnabled(data);
						});

						if (range) {
							sourceResult.changes[map.sourceDocument.uri] ??= [];
							sourceResult.changes[map.sourceDocument.uri].push({
								newText: resolveRenameEditText(tsEdit.newText, _data),
								range,
							});
							hasResult = true;
						}
					}
					else {
						const range = map.getSourceRange(tsEdit.range);
						if (range) {
							sourceResult.changes[map.sourceDocument.uri] ??= [];
							sourceResult.changes[map.sourceDocument.uri].push({ newText: tsEdit.newText, range });
							hasResult = true;
						}
					}
				}
			}
		}
		else {
			sourceResult.changes[tsUri] = edit.changes[tsUri];
			hasResult = true;
		}
	}
	if (edit.documentChanges) {
		for (const tsDocEdit of edit.documentChanges) {

			sourceResult.documentChanges ??= [];

			let sourceEdit: typeof tsDocEdit | undefined;
			if ('textDocument' in tsDocEdit) {

				const decoded = context.decodeEmbeddedDocumentUri(URI.parse(tsDocEdit.textDocument.uri));
				const sourceScript = decoded && context.language.scripts.get(decoded[0]);
				const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

				if (virtualCode) {
					for (const map of context.documents.getMaps(virtualCode)) {
						sourceEdit = {
							textDocument: {
								uri: map.sourceDocument.uri,
								version: versions[map.sourceDocument.uri] ?? null,
							},
							edits: [],
						} satisfies vscode.TextDocumentEdit;
						for (const tsEdit of tsDocEdit.edits) {
							if (mode === 'rename' || mode === 'fileName' || mode === 'codeAction') {
								let _data!: CodeInformation;
								const range = map.getSourceRange(tsEdit.range, data => {
									_data = data;
									// fix https://github.com/johnsoncodehk/volar/issues/1091
									return isRenameEnabled(data);
								});
								if (range) {
									sourceEdit.edits.push({
										annotationId: 'annotationId' in tsEdit ? tsEdit.annotationId : undefined,
										newText: resolveRenameEditText(tsEdit.newText, _data),
										range,
									});
								}
							}
							else {
								const range = map.getSourceRange(tsEdit.range);
								if (range) {
									sourceEdit.edits.push({
										annotationId: 'annotationId' in tsEdit ? tsEdit.annotationId : undefined,
										newText: tsEdit.newText,
										range,
									});
								}
							}
						}
						if (!sourceEdit.edits.length) {
							sourceEdit = undefined;
						}
					}
				}
				else {
					sourceEdit = tsDocEdit;
				}
			}
			else if (tsDocEdit.kind === 'create') {
				sourceEdit = tsDocEdit; // TODO: remove .ts?
			}
			else if (tsDocEdit.kind === 'rename') {

				const decoded = context.decodeEmbeddedDocumentUri(URI.parse(tsDocEdit.oldUri));
				const sourceScript = decoded && context.language.scripts.get(decoded[0]);
				const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

				if (virtualCode) {
					for (const map of context.documents.getMaps(virtualCode)) {
						// TODO: check capability?
						sourceEdit = {
							kind: 'rename',
							oldUri: map.sourceDocument.uri,
							newUri: tsDocEdit.newUri /* TODO: remove .ts? */,
							options: tsDocEdit.options,
							annotationId: tsDocEdit.annotationId,
						} satisfies vscode.RenameFile;
					}
				}
				else {
					sourceEdit = tsDocEdit;
				}
			}
			else if (tsDocEdit.kind === 'delete') {

				const decoded = context.decodeEmbeddedDocumentUri(URI.parse(tsDocEdit.uri));
				const sourceScript = decoded && context.language.scripts.get(decoded[0]);
				const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

				if (virtualCode) {
					for (const map of context.documents.getMaps(virtualCode)) {
						// TODO: check capability?
						sourceEdit = {
							kind: 'delete',
							uri: map.sourceDocument.uri,
							options: tsDocEdit.options,
							annotationId: tsDocEdit.annotationId,
						} satisfies vscode.DeleteFile;
					}
				}
				else {
					sourceEdit = tsDocEdit;
				}
			}
			if (sourceEdit) {
				pushEditToDocumentChanges(sourceResult.documentChanges, sourceEdit);
				hasResult = true;
			}
		}
	}
	if (hasResult) {
		return sourceResult;
	}
}

export function pushEditToDocumentChanges(arr: NonNullable<vscode.WorkspaceEdit['documentChanges']>, item: NonNullable<vscode.WorkspaceEdit['documentChanges']>[number]) {
	const current = arr.find(edit =>
		'textDocument' in edit
		&& 'textDocument' in item
		&& edit.textDocument.uri === item.textDocument.uri
	) as vscode.TextDocumentEdit | undefined;
	if (current) {
		current.edits.push(...(item as vscode.TextDocumentEdit).edits);
	}
	else {
		arr.push(item);
	}
}
