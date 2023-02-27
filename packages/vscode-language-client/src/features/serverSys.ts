import * as vscode from 'vscode';
import { BaseLanguageClient, State } from 'vscode-languageclient';
import { FsReadDirectoryRequest, FsReadFileRequest, FsStatRequest } from '@volar/language-server';

export async function register(client: BaseLanguageClient) {

	const subscriptions: vscode.Disposable[] = [];

	addHandle();

	subscriptions.push(client.onDidChangeState(() => {
		if (client.state === State.Running) {
			addHandle();
		}
	}));

	return vscode.Disposable.from(...subscriptions);

	function addHandle() {
		subscriptions.push(client.onRequest(FsStatRequest.type, async uri => {
			try {
				return await vscode.workspace.fs.stat(client.protocol2CodeConverter.asUri(uri));
			}
			catch {
				return;
			}
		}));

		subscriptions.push(client.onRequest(FsReadFileRequest.type, async uri => {
			try {
				return await vscode.workspace.fs.readFile(client.protocol2CodeConverter.asUri(uri));
			}
			catch {
				return;
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
