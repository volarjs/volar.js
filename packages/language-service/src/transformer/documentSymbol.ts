import * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common';

export function transform(symbol: vscode.DocumentSymbol, getOtherRange: (range: vscode.Range) => vscode.Range | undefined): vscode.DocumentSymbol | undefined {
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
			?.map(child => transform(child, getOtherRange))
			.filter(notEmpty),
	};
}
