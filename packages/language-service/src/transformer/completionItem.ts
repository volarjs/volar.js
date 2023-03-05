import * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common';
import { transform as transformTextEdit } from './textEdit';

export function transform<T extends vscode.CompletionItem>(
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
