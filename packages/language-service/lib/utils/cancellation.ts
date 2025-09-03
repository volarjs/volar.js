import type * as vscode from 'vscode-languageserver-protocol';

export const NoneCancellationToken: vscode.CancellationToken = {
	isCancellationRequested: false,
	onCancellationRequested: () => ({ dispose: () => {} }),
};
