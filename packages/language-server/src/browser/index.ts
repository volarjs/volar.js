import { configure as configureHttpRequests } from 'request-light';
import * as vscode from 'vscode-languageserver/browser';
import { startCommonLanguageServer } from '../common/server';
import { LanguageServerPlugin } from '../types';
import httpSchemaRequestHandler from '../common/schemaRequestHandlers/http';
import { createWebFileSystemHost } from './fileSystems';
import { URI } from 'vscode-uri';

export * from '../index';

export function createConnection() {

	const messageReader = new vscode.BrowserMessageReader(self);
	const messageWriter = new vscode.BrowserMessageWriter(self);
	const connection = vscode.createConnection(messageReader, messageWriter);

	return connection;
}

export function startLanguageServer(connection: vscode.Connection, ...plugins: LanguageServerPlugin[]) {

	const uriToFileName = (uri: string) => {
		if (uri.startsWith('https://unpkg.com/')) {
			return uri.replace('https://unpkg.com/', '/node_modules/');
		}
		const parsed = URI.parse(uri);
		return `/${parsed.scheme}/${parsed.fsPath}`;
	};
	const fileNameToUri = (fileName: string) => {
		if (fileName.startsWith('/node_modules/')) {
			return fileName.replace('/node_modules/', 'https://unpkg.com/');
		}
		const parts = fileName.split('/');
		if (parts.length < 3) {
			return URI.file(fileName).toString();
		}
		return URI.from({ scheme: parts[1], path: parts.slice(2).join('/') }).toString();
	};

	startCommonLanguageServer({
		plugins,
		connection,
		runtimeEnv: {
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
			schemaRequestHandlers: {
				http: httpSchemaRequestHandler,
				https: httpSchemaRequestHandler,
			},
			onDidChangeConfiguration(settings) {
				configureHttpRequests(settings.http && settings.http.proxy, settings.http && settings.http.proxyStrictSSL);
			},
			fileSystemProvide: undefined, // TODO
			createFileSystemHost: createWebFileSystemHost,
		},
	});
}
