import { Disposable } from '@volar/language-service';
import * as vscode from 'vscode-languageserver';

export function register(
	connection: vscode.Connection,
	initializeParams: vscode.InitializeParams
) {
	let watchFilesDisposableCounter = 0;
	let watchFilesDisposable: Disposable | undefined;

	const didChangeWatchedFilesCallbacks = new Set<vscode.NotificationHandler<vscode.DidChangeWatchedFilesParams>>();

	return {
		watchFiles,
		onDidChangeWatchedFiles,
	};

	async function watchFiles(patterns: string[]): Promise<Disposable> {
		const disposables: Disposable[] = [];
		const didChangeWatchedFiles = initializeParams.capabilities.workspace?.didChangeWatchedFiles;
		const fileOperations = initializeParams.capabilities.workspace?.fileOperations;
		if (didChangeWatchedFiles) {
			if (watchFilesDisposableCounter === 0) {
				watchFilesDisposable = connection.onDidChangeWatchedFiles(e => {
					for (const cb of didChangeWatchedFilesCallbacks) {
						cb(e);
					}
				});
			}
			watchFilesDisposableCounter++;
			disposables.push(
				{
					dispose() {
						watchFilesDisposableCounter--;
						if (watchFilesDisposableCounter === 0) {
							watchFilesDisposable?.dispose();
						}
					}
				}
			);
		}
		if (didChangeWatchedFiles?.dynamicRegistration) {
			disposables.push(
				await connection.client.register(vscode.DidChangeWatchedFilesNotification.type, {
					watchers: patterns.map(pattern => ({ globPattern: pattern })),
				})
			);
		}
		if (fileOperations?.dynamicRegistration && fileOperations.willRename) {
			disposables.push(
				await connection.client.register(vscode.WillRenameFilesRequest.type, {
					filters: patterns.map(pattern => ({ pattern: { glob: pattern } })),
				})
			);
		}

		return {
			dispose() {
				for (const disposable of disposables) {
					disposable.dispose();
				}
				disposables.length = 0;
			},
		};
	}

	function onDidChangeWatchedFiles(cb: vscode.NotificationHandler<vscode.DidChangeWatchedFilesParams>) {
		didChangeWatchedFilesCallbacks.add(cb);
		return {
			dispose: () => {
				didChangeWatchedFilesCallbacks.delete(cb);
			},
		};
	}
}
