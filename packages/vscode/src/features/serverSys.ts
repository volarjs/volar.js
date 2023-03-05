import * as vscode from 'vscode';
import { BaseLanguageClient, State } from 'vscode-languageclient';
import { FsReadDirectoryRequest, FsReadFileRequest } from '@volar/language-server';

export async function activate(
	context: vscode.ExtensionContext,
	client: BaseLanguageClient,
	cdn: string | undefined,
) {

	const subscriptions: vscode.Disposable[] = [];

	addHandle();

	subscriptions.push(client.onDidChangeState(() => {
		if (client.state === State.Running) {
			addHandle();
		}
	}));

	if (cdn) {
		console.log('skips:', context.globalState.keys().filter(key => key.startsWith(cdn)).length);
	}

	return vscode.Disposable.from(...subscriptions);

	function addHandle() {

		subscriptions.push(client.onRequest(FsReadFileRequest.type, async uri => {
			if (cdn && uri.startsWith(cdn) && context.globalState.get(uri) === false) {
				return;
			}
			const uri2 = client.protocol2CodeConverter.asUri(uri);
			try {
				return await vscode.workspace.fs.readFile(uri2);
			}
			catch (err) {
				if (cdn && uri.startsWith(cdn)) {
					context.globalState.update(uri, false);
				}
			}
		}));

		subscriptions.push(client.onRequest(FsReadDirectoryRequest.type, async uri => {
			try {
				if (cdn && uri.startsWith(cdn)) {
					return [];
				}
				const uri2 = client.protocol2CodeConverter.asUri(uri);
				let data = await vscode.workspace.fs.readDirectory(uri2);
				data = data.filter(([name]) => !name.startsWith('.'));
				return data;
			}
			catch {
				return [];
			}
		}));
	}
}
