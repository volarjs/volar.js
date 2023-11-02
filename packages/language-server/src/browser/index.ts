import * as vscode from 'vscode-languageserver/browser';
import { startCommonLanguageServer } from '../common/server';
import { LanguageServerPlugin } from '../types';
import httpSchemaRequestHandler from '../common/schemaRequestHandlers/http';
import { URI } from 'vscode-uri';
import {
	FsReadFileRequest,
	FsReadDirectoryRequest,
	FsStatRequest,
	FsCacheRequest,
	UseReadFileCacheNotification,
	UseReadDirectoryCacheNotification,
	UseStatCacheNotification
} from '../protocol';
import { FileType, FileStat } from '@volar/language-service';

export * from '../index';

export function createConnection() {

	const messageReader = new vscode.BrowserMessageReader(self);
	const messageWriter = new vscode.BrowserMessageWriter(self);
	const connection = vscode.createConnection(messageReader, messageWriter);

	return connection;
}

export function startLanguageServer(connection: vscode.Connection, ...plugins: LanguageServerPlugin[]) {

	const jobs = new Map<Promise<any>, string>();

	let cache: ReturnType<typeof requestCache> | undefined;
	let fsProgress: Promise<vscode.WorkDoneProgressServerReporter> | undefined;
	let totalJobs = 0;

	startCommonLanguageServer(connection, plugins, () => ({
		uriToFileName,
		fileNameToUri,
		console: connection.console,
		timer: {
			setImmediate(callback: (...args: any[]) => void, ...args: any[]): vscode.Disposable {
				const handle = setTimeout(callback, 0, ...args);
				return { dispose: () => clearTimeout(handle) };
			},
		},
		async loadTypeScript(options) {
			const tsdkUrl = options.typescript && 'tsdkUrl' in options.typescript
				? options.typescript.tsdkUrl
				: undefined;
			if (!tsdkUrl) {
				return;
			}
			const _module = globalThis.module;
			globalThis.module = { exports: {} } as typeof _module;
			await import(`${tsdkUrl}/typescript.js`);
			const ts = globalThis.module.exports;
			globalThis.module = _module;
			return ts as typeof import('typescript/lib/tsserverlibrary');
		},
		async loadTypeScriptLocalized(options, locale) {
			const tsdkUrl = options.typescript && 'tsdkUrl' in options.typescript
				? options.typescript.tsdkUrl
				: undefined;
			if (!tsdkUrl) {
				return;
			}
			try {
				const json = await httpSchemaRequestHandler(`${tsdkUrl}/${locale}/diagnosticMessages.generated.json`);
				if (json) {
					return JSON.parse(json);
				}
			}
			catch { }
		},
		fs: {
			async stat(uri) {
				if (uri.startsWith('__invalid__:')) {
					return;
				}
				if (uri.startsWith('http://') || uri.startsWith('https://')) { // perf
					const text = await this.readFile(uri);
					if (text !== undefined) {
						return {
							type: FileType.File,
							size: text.length,
							ctime: -1,
							mtime: -1,
						};
					}
					return undefined;
				}
				if (!cache) {
					cache = requestCache();
				}
				const _cache = await cache;
				if (_cache.stat.has(uri)) {
					const res = _cache.stat.get(uri)!;
					_cache.stat.delete(uri);
					connection.sendNotification(UseStatCacheNotification.type, uri);
					return res;
				}
				return await connection.sendRequest(FsStatRequest.type, uri);
			},
			async readFile(uri) {
				if (uri.startsWith('__invalid__:')) {
					return;
				}
				if (uri.startsWith('http://') || uri.startsWith('https://')) { // perf
					return await httpSchemaRequestHandler(uri);
				}
				return withProgress(async () => {
					if (!cache) {
						cache = requestCache();
					}
					const _cache = await cache;
					if (_cache.readFile.has(uri)) {
						const res = _cache.readFile.get(uri)!;
						_cache.readFile.delete(uri);
						connection.sendNotification(UseReadFileCacheNotification.type, uri);
						return res;
					}
					return await connection.sendRequest(FsReadFileRequest.type, uri) ?? undefined;
				}, uri);
			},
			async readDirectory(uri) {
				if (uri.startsWith('__invalid__:')) {
					return [];
				}
				if (uri.startsWith('http://') || uri.startsWith('https://')) { // perf
					return [];
				}
				return withProgress(async () => {
					if (!cache) {
						cache = requestCache();
					}
					const _cache = await cache;
					if (_cache.readDirectory.has(uri)) {
						const res = _cache.readDirectory.get(uri)!;
						_cache.readDirectory.delete(uri);
						connection.sendNotification(UseReadDirectoryCacheNotification.type, uri);
						return res;
					}
					return await connection.sendRequest(FsReadDirectoryRequest.type, uri);
				}, uri);
			},
		},
		getCancellationToken(original) {
			return original ?? vscode.CancellationToken.None;
		},
	}));

	async function requestCache() {

		const stat = new Map<string, FileStat>();
		const readDirectory = new Map<string, [string, FileType][]>();
		const readFile = new Map<string, string>();
		const cache = await connection.sendRequest(FsCacheRequest.type);

		for (const [uri, fileStat] of cache?.stat ?? []) {
			stat.set(uri, fileStat);
		}
		for (const [uri, entries] of cache?.readDirectory ?? []) {
			readDirectory.set(uri, entries);
		}
		for (const [uri, text] of cache?.readFile ?? []) {
			readFile.set(uri, text);
		}

		return {
			stat,
			readDirectory,
			readFile,
		};
	}

	async function withProgress<T>(fn: () => Promise<T>, asset: string): Promise<T> {
		const path = URI.parse(asset).path;
		if (!fsProgress) {
			fsProgress = connection.window.createWorkDoneProgress();
			fsProgress.then(progress => progress.begin('', 0));
		}
		const _fsProgress = await fsProgress;
		totalJobs++;
		let job!: Promise<T>;
		try {
			job = fn();
			jobs.set(job, path);
			for (const [_, path] of jobs) {
				_fsProgress.report(0, `Loading ${totalJobs - jobs.size} of ${totalJobs} files: ${path}`);
				break;
			}
			return await job;
		} finally {
			jobs.delete(job);
			if (jobs.size === 0) {
				_fsProgress.done();
				fsProgress = undefined;
			}
			else {
				for (const [_, path] of jobs) {
					_fsProgress.report((totalJobs - jobs.size) / totalJobs * 100, `Loading ${totalJobs - jobs.size} of ${totalJobs} files: ${path}`);
					break;
				}
			}
		}
	}
}

function uriToFileName(uri: string) {
	const parsed = URI.parse(uri);
	if (parsed.scheme === '__invalid__') {
		return parsed.path;
	}
	return `/${parsed.scheme}${parsed.authority ? '@' + parsed.authority : ''}${parsed.path}`;
}

function fileNameToUri(fileName: string) {
	const parts = fileName.split('/');
	if (parts.length <= 1) {
		return URI.from({
			scheme: '__invalid__',
			path: fileName,
		}).toString();
	}
	const firstParts = parts[1].split('@');
	return URI.from({
		scheme: firstParts[0],
		authority: firstParts.length > 1 ? firstParts[1] : undefined,
		path: '/' + parts.slice(2).join('/'),
	}).toString();
}
