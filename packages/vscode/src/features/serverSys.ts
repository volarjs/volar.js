import * as vscode from 'vscode';
import type { BaseLanguageClient, State } from 'vscode-languageclient';
import { FsReadDirectoryRequest, FsReadFileRequest, FsStatRequest } from '@volar/language-server/protocol';

export async function activate(client: BaseLanguageClient) {

	const subscriptions: vscode.Disposable[] = [];
	const textDecoder = new TextDecoder();

	addHandle();

	subscriptions.push(client.onDidChangeState(() => {
		if (client.state === 2 satisfies State.Running) {
			addHandle();
		}
	}));

	return vscode.Disposable.from(...subscriptions);

	function addHandle() {

		subscriptions.push(client.onRequest(FsStatRequest.type, async uri => {
			const uri2 = client.protocol2CodeConverter.asUri(uri);
			try {
				return await vscode.workspace.fs.stat(uri2);
			}
			catch (err) {
				// ignore
			}
		}));

		subscriptions.push(client.onRequest(FsReadFileRequest.type, async uri => {
			const uri2 = client.protocol2CodeConverter.asUri(uri);
			try {
				const data = await vscode.workspace.fs.readFile(uri2);
				const text = textDecoder.decode(data);
				return text;
			}
			catch (err) {
				// ignore
			}
		}));

		subscriptions.push(client.onRequest(FsReadDirectoryRequest.type, async uri => {
			try {
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
