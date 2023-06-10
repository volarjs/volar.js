import * as vscode from 'vscode-languageserver/browser';
import { startCommonLanguageServer } from '../common/server';
import { LanguageServerPlugin } from '../types';
import httpSchemaRequestHandler from '../common/schemaRequestHandlers/http';
import { URI } from 'vscode-uri';
import { FsReadFileRequest, FsReadDirectoryRequest, FsStatRequest } from '../protocol';

export * from '../index';

export function createConnection() {

	const messageReader = new vscode.BrowserMessageReader(self);
	const messageWriter = new vscode.BrowserMessageWriter(self);
	const connection = vscode.createConnection(messageReader, messageWriter);

	return connection;
}

export function startLanguageServer(connection: vscode.Connection, ...plugins: LanguageServerPlugin[]) {
	startCommonLanguageServer(connection, plugins, () => ({
		uriToFileName,
		fileNameToUri,
		timer: {
			setImmediate(callback: (...args: any[]) => void, ...args: any[]): vscode.Disposable {
				const handle = setTimeout(callback, 0, ...args);
				return { dispose: () => clearTimeout(handle) };
			},
		},
		loadTypescript() {
			return require('typescript'); // force bundle because not support load by user config in web
		},
		async loadTypescriptLocalized(tsdk, locale) {
			try {
				const uri = fileNameToUri(`${tsdk}/${locale}/diagnosticMessages.generated.json`);
				const json = await httpSchemaRequestHandler(uri);
				if (json) {
					return JSON.parse(json);
				}
			}
			catch { }
		},
		fs: {
			stat(uri) {
				return connection.sendRequest(FsStatRequest.type, uri);
			},
			async readFile(uri, encoding) {
				const data = await connection.sendRequest(FsReadFileRequest.type, uri);
				if (data) {
					return new TextDecoder(encoding ?? 'utf8').decode(data);
				}
				if (uri.startsWith('http://') || uri.startsWith('https://')) {
					return await httpSchemaRequestHandler(uri);
				}
			},
			async readDirectory(uri) {
				return connection.sendRequest(FsReadDirectoryRequest.type, uri);
			},
		},
	}));
}

function uriToFileName(uri: string) {
	const parsed = URI.parse(uri);
	return `/${parsed.scheme}${parsed.authority ? '@' + parsed.authority : ''}${parsed.path}`;
};

function fileNameToUri(fileName: string) {
	const parts = fileName.split('/');
	if (parts.length <= 1) {
		return URI.from({ scheme: '', path: '' }).toString();
	}
	const firstParts = parts[1].split('@');
	return URI.from({
		scheme: firstParts[0],
		authority: firstParts.length > 1 ? firstParts[1] : undefined,
		path: '/' + parts.slice(2).join('/'),
	}).toString();
};
