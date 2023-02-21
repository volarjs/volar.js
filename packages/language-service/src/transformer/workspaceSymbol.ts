import * as vscode from 'vscode-languageserver-protocol';

export function transform(symbol: vscode.WorkspaceSymbol, getOtherLocation: (location: vscode.Location) => vscode.Location | undefined): vscode.WorkspaceSymbol | undefined {
	if (!vscode.Location.is(symbol.location)) {
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
