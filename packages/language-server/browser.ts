import * as vscode from 'vscode-languageserver/browser';
import { startLanguageServerBase } from './lib/server';
import type { SimpleServerPlugin, ServerProjectProvider, TypeScriptServerPlugin } from './lib/types';
import httpSchemaRequestHandler from './lib/schemaRequestHandlers/http';
import { URI } from 'vscode-uri';
import { FsReadFileRequest, FsReadDirectoryRequest, FsStatRequest } from './protocol';
import { FileType } from '@volar/language-service';
import { createSimpleProjectProvider, type WorkspacesContext } from './lib/project/simpleProjectProvider';
import { createTypeScriptProjectProvider } from './lib/project/typescriptProjectProvider';

export * from 'vscode-languageserver/browser';
export * from './index';

export function createConnection() {

	const messageReader = new vscode.BrowserMessageReader(self);
	const messageWriter = new vscode.BrowserMessageWriter(self);
	const connection = vscode.createConnection(messageReader, messageWriter);

	return connection;
}

export function startSimpleServer(
	connection: vscode.Connection,
	...plugins: SimpleServerPlugin[]
) {
	return startServer(
		connection,
		createSimpleProjectProvider,
		...plugins,
	);
}

export function startTypeScriptServer(
	connection: vscode.Connection,
	...plugins: TypeScriptServerPlugin[]
) {
	return startServer(
		connection,
		createTypeScriptProjectProvider,
		...plugins,
	);
}

function startServer<P extends SimpleServerPlugin<any, any>>(
	connection: vscode.Connection,
	createProjectProvider: (context: WorkspacesContext, plugins: ReturnType<P>[]) => ServerProjectProvider,
	...plugins: P[]
) {
	startLanguageServerBase(connection, plugins, createProjectProvider, () => ({
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
		getCancellationToken(original) {
			return original ?? vscode.CancellationToken.None;
		},
	}));
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
