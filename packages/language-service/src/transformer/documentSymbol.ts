import * as vscode from 'vscode-languageserver-protocol';

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
	};
}
