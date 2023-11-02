import * as vscode from 'vscode';
import type { BaseLanguageClient, State } from 'vscode-languageclient';
import { FsReadDirectoryRequest, FsReadFileRequest, FsStatRequest } from '@volar/language-server/protocol';

export async function activate(context: vscode.ExtensionContext, client: BaseLanguageClient) {

	const subscriptions: vscode.Disposable[] = [];
	const textDecoder = new TextDecoder();

	addRequestHandlers();

	subscriptions.push(client.onDidChangeState(() => {
		if (client.state === 2 satisfies State.Running) {
			addRequestHandlers();
		}
	}));

	return vscode.Disposable.from(...subscriptions);

	// To avoid hitting the API hourly limit, we keep requests as low as possible.
	function addRequestHandlers() {

		subscriptions.push(client.onRequest(FsStatRequest.type, stat));
		subscriptions.push(client.onRequest(FsReadFileRequest.type, readFile));
		subscriptions.push(client.onRequest(FsReadDirectoryRequest.type, readDirectory));

		async function stat(uri: string) {

			// return early
			const dirUri = uri.substring(0, uri.lastIndexOf('/'));
			const baseName = uri.substring(uri.lastIndexOf('/') + 1);
			const entries = await readDirectory(dirUri);
			if (!entries.some(entry => entry[0] === baseName)) {
				return;
			}

			const uri2 = client.protocol2CodeConverter.asUri(uri);
			return await _stat(uri2);
		}

		async function readFile(uri: string) {

			// return early
			const dirUri = uri.substring(0, uri.lastIndexOf('/'));
			const baseName = uri.substring(uri.lastIndexOf('/') + 1);
			const entries = await readDirectory(dirUri);
			const uri2 = client.protocol2CodeConverter.asUri(uri);

			let stat: vscode.FileStat | undefined;

			if (!entries.some(entry => entry[0] === baseName && entry[1] === vscode.FileType.File)) {
				stat = undefined;
			}
			else {
				stat = await _stat(uri2);
			}

			if (context.workspaceState.get<number>(uri + '?mtime') !== stat?.mtime) {
				if (stat) {
					const data = await _readFile(uri2);
					context.workspaceState.update(uri + '?mtime', stat.mtime);
					context.workspaceState.update(uri, data);
				}
				else {
					context.workspaceState.update(uri + '?mtime', undefined);
					context.workspaceState.update(uri, undefined);
				}
			}

			return context.workspaceState.get<string>(uri);
		}

		async function readDirectory(uri: string): Promise<[string, vscode.FileType][]> {

			const uri2 = client.protocol2CodeConverter.asUri(uri);
			const stat = await _stat(uri2);

			if (context.workspaceState.get<number>(uri + '?mtime') !== stat?.mtime) {
				if (stat) {
					const data = stat.type === vscode.FileType.Directory
						? (await _readDirectory(uri2))
							.filter(([name]) => !name.startsWith('.'))
						: [];
					context.workspaceState.update(uri + '?mtime', stat.mtime);
					context.workspaceState.update(uri + '?readdir', data);
				}
				else {
					context.workspaceState.update(uri + '?mtime', undefined);
					context.workspaceState.update(uri + '?readdir', undefined);
				}
			}

			return await context.workspaceState.get<[string, vscode.FileType][]>(uri + '?readdir') ?? [];
		}

		async function _readFile(uri: vscode.Uri) {
			try {
				return textDecoder.decode(await vscode.workspace.fs.readFile(uri));
			} catch { }
		}

		async function _readDirectory(uri: vscode.Uri) {
			try {
				return await vscode.workspace.fs.readDirectory(uri);
			} catch {
				return [];
			}
		}

		async function _stat(uri: vscode.Uri) {
			try {
				return await vscode.workspace.fs.stat(uri);
			} catch { }
		}
	}
}
