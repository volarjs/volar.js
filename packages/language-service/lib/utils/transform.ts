import type * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from './common';
import type { ServiceContext } from '../types';
import { type CodeInformation, resolveRenameEditText, isRenameEnabled } from '@volar/language-core';

export function transformCompletionItem<T extends vscode.CompletionItem>(
	item: T,
	getOtherRange: (range: vscode.Range) => vscode.Range | undefined,
	document: vscode.TextDocument,
): T {
	return {
		...item,
		additionalTextEdits: item.additionalTextEdits
			?.map(edit => transformTextEdit(edit, getOtherRange, document))
			.filter(notEmpty),
		textEdit: item.textEdit
			? transformTextEdit(item.textEdit, getOtherRange, document)
			: undefined,
	};
}

export function transformCompletionList<T extends vscode.CompletionList>(
	completionList: T,
	getOtherRange: (range: vscode.Range) => vscode.Range | undefined,
	document: vscode.TextDocument,
	onItem?: (newItem: vscode.CompletionItem, oldItem: vscode.CompletionItem) => void,
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
		items: completionList.items.map(item => {
			const newItem = transformCompletionItem(item, getOtherRange, document);
			onItem?.(newItem, item);
			return newItem;
		}),
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
	{ documents, language, env }: ServiceContext,
	mode: 'fileName' | 'rename' | 'codeAction' | undefined,
	versions: Record<string, number> = {},
) {

	const sourceResult: vscode.WorkspaceEdit = {};
	let hasResult = false;

	for (const tsUri in edit.changeAnnotations) {

		sourceResult.changeAnnotations ??= {};

		const tsAnno = edit.changeAnnotations[tsUri];
		const [virtualFile] = language.files.getVirtualFile(env.uriToFileName(tsUri));

		if (virtualFile) {
			for (const map of documents.getMaps(virtualFile)) {
				// TODO: check capability?
				const uri = map.sourceFileDocument.uri;
				sourceResult.changeAnnotations[uri] = tsAnno;
			}
		}
		else {
			sourceResult.changeAnnotations[tsUri] = tsAnno;
		}
	}
	for (const tsUri in edit.changes) {

		sourceResult.changes ??= {};

		const [virtualFile] = language.files.getVirtualFile(env.uriToFileName(tsUri));

		if (virtualFile) {
			for (const map of documents.getMaps(virtualFile)) {
				const tsEdits = edit.changes[tsUri];
				for (const tsEdit of tsEdits) {
					if (mode === 'rename' || mode === 'fileName' || mode === 'codeAction') {

						let _data!: CodeInformation;

						const range = map.getSourceRange(tsEdit.range, data => {
							_data = data;
							return isRenameEnabled(data);
						});

						if (range) {
							sourceResult.changes[map.sourceFileDocument.uri] ??= [];
							sourceResult.changes[map.sourceFileDocument.uri].push({
								newText: resolveRenameEditText(tsEdit.newText, _data),
								range,
							});
							hasResult = true;
						}
					}
					else {
						const range = map.getSourceRange(tsEdit.range);
						if (range) {
							sourceResult.changes[map.sourceFileDocument.uri] ??= [];
							sourceResult.changes[map.sourceFileDocument.uri].push({ newText: tsEdit.newText, range });
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

				const [virtualFile] = language.files.getVirtualFile(env.fileNameToUri(tsDocEdit.textDocument.uri));

				if (virtualFile) {
					for (const map of documents.getMaps(virtualFile)) {
						sourceEdit = {
							textDocument: {
								uri: map.sourceFileDocument.uri,
								version: versions[map.sourceFileDocument.uri] ?? null,
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

				const [virtualFile] = language.files.getVirtualFile(env.uriToFileName(tsDocEdit.oldUri));

				if (virtualFile) {
					for (const map of documents.getMaps(virtualFile)) {
						// TODO: check capability?
						sourceEdit = {
							kind: 'rename',
							oldUri: map.sourceFileDocument.uri,
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

				const [virtualFile] = language.files.getVirtualFile(env.uriToFileName(tsDocEdit.uri));

				if (virtualFile) {
					for (const map of documents.getMaps(virtualFile)) {
						// TODO: check capability?
						sourceEdit = {
							kind: 'delete',
							uri: map.sourceFileDocument.uri,
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
