import * as vscode from 'vscode';
import { BaseLanguageClient, State } from 'vscode-languageclient';
import { FsReadDirectoryRequest, FsReadFileRequest, FsStatRequest } from '@volar/language-server';

export async function register(
	context: vscode.ExtensionContext,
	client: BaseLanguageClient,
) {

	const subscriptions: vscode.Disposable[] = [];

	addHandle();

	subscriptions.push(client.onDidChangeState(() => {
		if (client.state === State.Running) {
			addHandle();
		}
	}));

	return vscode.Disposable.from(...subscriptions);

	function addHandle() {
		subscriptions.push(client.onRequest(FsStatRequest.type, async uris => {
			return await Promise.all(uris.map(async uri => {
				if (context.globalState.get(uri) === false) {
					return;
				}
				try {
					return await vscode.workspace.fs.stat(client.protocol2CodeConverter.asUri(uri));
				}
				catch {
					if (['http', 'https'].includes(uri.split(':')[0])) {
						console.log('remember skip', uri);
						context.globalState.update(uri, false);
					}
				}
			}));
		}));

		subscriptions.push(client.onRequest(FsReadFileRequest.type, async uri => {
			if (context.globalState.get(uri) === false) {
				return;
			}
			try {
				return await vscode.workspace.fs.readFile(client.protocol2CodeConverter.asUri(uri));
			}
			catch (err) {
				if (['http', 'https'].includes(uri.split(':')[0])) {
					console.log('remember skip', uri);
					context.globalState.update(uri, false);
				}
			}
		}));

		subscriptions.push(client.onRequest(FsReadDirectoryRequest.type, async uri => {
			try {
				return await vscode.workspace.fs.readDirectory(client.protocol2CodeConverter.asUri(uri));
			}
			catch {
				return [];
			}
		}));
	}
}
