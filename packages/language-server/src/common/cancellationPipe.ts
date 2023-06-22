import * as vscode from 'vscode-languageserver';

export type CancellationTokenHost = ReturnType<typeof createCancellationTokenHost>;

export function createCancellationTokenHost(_cancellationPipeName: string | undefined) {

	if (_cancellationPipeName === undefined) {
		return {
			createCancellationToken(original?: vscode.CancellationToken) {
				return original ?? vscode.CancellationToken.None;
			},
		};
	}

	const cancellationPipeName = _cancellationPipeName;
	const fs: typeof import('fs') = require('fs');

	return {
		createCancellationToken,
	};

	function createCancellationToken(original?: vscode.CancellationToken) {

		const mtime = getMtime();

		let currentMtime = mtime;
		let updateAt = Date.now();

		const token: vscode.CancellationToken = {
			get isCancellationRequested() {
				if (original?.isCancellationRequested) {
					return true;
				}
				// debounce 20ms
				if (currentMtime === mtime && Date.now() - updateAt >= 20) {
					currentMtime = getMtime();
					updateAt = Date.now();
				}
				return currentMtime !== mtime;
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
