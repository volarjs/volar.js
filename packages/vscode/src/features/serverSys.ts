import * as vscode from 'vscode';
import type { BaseLanguageClient, State } from 'vscode-languageclient';
import { FsReadDirectoryRequest, FsReadFileRequest, FsStatRequest } from '@volar/language-server/protocol';

export async function activate(client: BaseLanguageClient) {

	const subscriptions: vscode.Disposable[] = [];
	const textDecoder = new TextDecoder();
	const jobs = new Map<Promise<any>, string>();

	let startProgress = false;
	let totalJobs = 0;

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
		subscriptions.push(client.onRequest(FsReadFileRequest.type, uri => {
			return withProgress(() => readFile(uri), uri);
		}));
		subscriptions.push(client.onRequest(FsReadDirectoryRequest.type, uri => {
			return withProgress(() => readDirectory(uri), uri);
		}));

		async function withProgress<T>(fn: () => Promise<T>, asset: string): Promise<T> {
			asset = vscode.Uri.parse(asset).path;
			totalJobs++;
			let job!: Promise<T>;
			try {
				job = fn();
				jobs.set(job, asset);
				if (!startProgress && jobs.size >= 2) {
					startProgress = true;
					vscode.window.withProgress({ location: vscode.ProgressLocation.Window }, async progress => {
						progress.report({
							message: `Loading ${totalJobs} resources: ${asset}`
						});
						while (jobs.size) {
							for (const [_, asset] of jobs) {
								progress.report({
									message: `Loading ${totalJobs} resources: ${asset}`,
								});
								await sleep(100);
								break;
							}
						}
						startProgress = false;
					});
				}
				return await job;
			} finally {
				jobs.delete(job);
			}
		}

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

			if (!entries.some(entry => entry[0] === baseName && entry[1] === vscode.FileType.File)) {
				return;
			}

			return await _readFile(uri2);
		}

		async function readDirectory(uri: string): Promise<[string, vscode.FileType][]> {

			const uri2 = client.protocol2CodeConverter.asUri(uri);

			return await (await _readDirectory(uri2))
				.filter(([name]) => !name.startsWith('.'));
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

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
