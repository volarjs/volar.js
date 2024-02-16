import { FileType } from '@volar/language-service';
import * as vscode from 'vscode-languageserver/browser';
import httpSchemaRequestHandler from './lib/schemaRequestHandlers/http';
import { createServerBase } from './lib/server';
import { fileNameToUri, uriToFileName } from './lib/uri';
import { FsReadDirectoryRequest, FsReadFileRequest, FsStatRequest } from './protocol';

export * from 'vscode-languageserver/browser';
export * from './index';
export * from './lib/project/simpleProjectProvider';
export * from './lib/project/typescriptProjectProvider';

export function createConnection() {

	const messageReader = new vscode.BrowserMessageReader(self);
	const messageWriter = new vscode.BrowserMessageWriter(self);
	const connection = vscode.createConnection(messageReader, messageWriter);

	return connection;
}

export function createServer(connection: vscode.Connection) {
	return createServerBase(connection, () => ({
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
			return ts as typeof import('typescript');
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
				return await connection.sendRequest(FsStatRequest.type, uri);
			},
			async readFile(uri) {
				if (uri.startsWith('__invalid__:')) {
					return;
				}
				if (uri.startsWith('http://') || uri.startsWith('https://')) { // perf
					return await httpSchemaRequestHandler(uri);
				}
				return await connection.sendRequest(FsReadFileRequest.type, uri) ?? undefined;
			},
			async readDirectory(uri) {
				if (uri.startsWith('__invalid__:')) {
					return [];
				}
				if (uri.startsWith('http://') || uri.startsWith('https://')) { // perf
					return [];
				}
				return await connection.sendRequest(FsReadDirectoryRequest.type, uri);
			},
		},
	}));
}
