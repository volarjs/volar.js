import * as vscode from 'vscode-languageserver';

export function createGetCancellationToken(
	fs: typeof import('fs'),
	_cancellationPipeName: string | undefined
) {

	if (_cancellationPipeName === undefined) {
		return (original?: vscode.CancellationToken) => {
			return original ?? vscode.CancellationToken.None;
		};
	}

	const cancellationPipeName = _cancellationPipeName;

	return getCancellationToken;

	function getCancellationToken(original?: vscode.CancellationToken) {

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
