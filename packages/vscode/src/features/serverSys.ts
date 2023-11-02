import * as vscode from 'vscode';
import { BaseLanguageClient, State, DidChangeWatchedFilesNotification, FileChangeType } from 'vscode-languageclient';
import {
	FsReadDirectoryRequest,
	FsReadFileRequest,
	FsStatRequest,
	FsCacheRequest,
	UseReadFileCacheNotification,
	UseReadDirectoryCacheNotification,
	UseStatCacheNotification
} from '@volar/language-server/protocol';

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

		subscriptions.push(client.onRequest(FsCacheRequest.type, getCache));
		subscriptions.push(client.onNotification(UseStatCacheNotification.type, async uri => {

			const cache = context.workspaceState.get<vscode.FileStat>(uri + '?stat');
			const _stat = await stat(uri);

			if (_stat?.mtime !== cache?.mtime) {
				if (cache?.type !== vscode.FileType.File && _stat?.type === vscode.FileType.File) {
					await client.sendNotification(DidChangeWatchedFilesNotification.type, {
						changes: [{ uri, type: FileChangeType.Created }]
					});
				}
				else if (cache?.type === vscode.FileType.File && _stat?.type !== vscode.FileType.File) {
					await client.sendNotification(DidChangeWatchedFilesNotification.type, {
						changes: [{ uri, type: FileChangeType.Deleted }]
					});
				}
				else {
					await client.sendNotification(DidChangeWatchedFilesNotification.type, {
						changes: [{ uri, type: FileChangeType.Changed }]
					});
				}
			}
		}));
		subscriptions.push(client.onNotification(UseReadFileCacheNotification.type, async uri => {

			const mtime = context.workspaceState.get<number>(uri + '?mtime');
			const _stat = await stat(uri);

			if (_stat?.mtime !== mtime) {
				if (mtime === undefined && _stat?.type === vscode.FileType.File) {
					await client.sendNotification(DidChangeWatchedFilesNotification.type, {
						changes: [{ uri, type: FileChangeType.Created }]
					});
				}
				else if (mtime !== undefined && _stat?.type !== vscode.FileType.File) {
					await client.sendNotification(DidChangeWatchedFilesNotification.type, {
						changes: [{ uri, type: FileChangeType.Deleted }]
					});
				}
				else {
					await client.sendNotification(DidChangeWatchedFilesNotification.type, {
						changes: [{ uri, type: FileChangeType.Changed }]
					});
				}
			}
		}));
		subscriptions.push(client.onNotification(UseReadDirectoryCacheNotification.type, async uri => {

			const mtime = context.workspaceState.get<number>(uri + '?mtime');
			const _stat = await stat(uri);

			if (_stat?.mtime !== mtime) {

				const oldEntries = (context.workspaceState.get<[string, vscode.FileType][]>(uri + '?readdir') ?? [])
					.reduce((map, item) => {
						map.set(item[0], item[1]);
						return map;
					}, new Map<string, vscode.FileType>());
				const newEntries = (await readDirectory(uri))
					.reduce((map, item) => {
						map.set(item[0], item[1]);
						return map;
					}, new Map<string, vscode.FileType>());
				const changes: { uri: string, type: FileChangeType; }[] = [];

				for (const [name, fileType] of oldEntries) {
					if (fileType === vscode.FileType.File && newEntries.get(name) !== vscode.FileType.File) {
						changes.push({ uri: uri + '/' + name, type: FileChangeType.Deleted });
					}
				}
				for (const [name, fileType] of newEntries) {
					if (fileType === vscode.FileType.File && oldEntries.get(name) !== vscode.FileType.File) {
						changes.push({ uri: uri + '/' + name, type: FileChangeType.Changed });
					}
				}

				await client.sendNotification(DidChangeWatchedFilesNotification.type, { changes });
			}
		}));

		function getCache() {

			const res: FsCacheRequest.ResponseType = {
				stat: [],
				readDirectory: [],
				readFile: [],
			};

			for (const key of context.workspaceState.keys()) {
				const value = context.workspaceState.get(key)!;
				if (key.endsWith('?stat')) {
					res.stat.push([key.slice(0, -'?stat'.length), value as vscode.FileStat]);
				}
				else if (key.endsWith('?readdir')) {
					res.readDirectory.push([key.slice(0, -'?readdir'.length), value as [string, vscode.FileType][]]);
				}
				else if (!key.includes('?')) {
					res.readFile.push([key, value as string]);
				}
			}

			return res;
		}

		async function stat(uri: string) {

			const uri2 = client.protocol2CodeConverter.asUri(uri);
			const stat = await _stat(uri2);

			context.workspaceState.update(uri + '?stat', stat);

			return stat;
		}

		async function readFile(uri: string) {

			const uri2 = client.protocol2CodeConverter.asUri(uri);
			const stat = await _stat(uri2);

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

			return context.workspaceState.get<[string, vscode.FileType][]>(uri + '?readdir') ?? [];
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
