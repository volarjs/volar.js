import * as vscode from 'vscode-languageserver';

export type CancellationTokenHost = ReturnType<typeof createCancellationTokenHost>;

export function createCancellationTokenHost(_cancellationPipeName: string | undefined) {

	if (_cancellationPipeName === undefined) {
		return {
			createCancellationToken(original: vscode.CancellationToken) {
				return original;
			},
			getMtime() {
				return -1;
			}
		};
	}

	const cancellationPipeName = _cancellationPipeName;
	const fs: typeof import('fs') = require('fs');

	return {
		createCancellationToken,
		getMtime,
	};

	function createCancellationToken(original: vscode.CancellationToken) {
		const mtime = getMtime();
		const token: vscode.CancellationToken = {
			get isCancellationRequested() {
				if (original.isCancellationRequested) {
					return true;
				}
				return getMtime() !== mtime;
			},
			onCancellationRequested: vscode.Event.None,
		};
		return token;
	}
	function getMtime() {
		try {
			const stat = fs.statSync(cancellationPipeName, { throwIfNoEntry: false });
			return stat?.mtime.valueOf() ?? -1;
		}
		catch {
			return -1;
		}
	}
}
