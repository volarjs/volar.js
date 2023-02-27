import { configure as configureHttpRequests } from 'request-light';
import * as vscode from 'vscode-languageserver/browser';
import { startCommonLanguageServer } from '../common/server';
import { LanguageServerPlugin } from '../types';
import httpSchemaRequestHandler from '../common/schemaRequestHandlers/http';
import { createWebFileSystemHost } from './fileSystems';
import * as shared from '@volar/shared';

export * from '../index';

export function createConnection() {

	const messageReader = new vscode.BrowserMessageReader(self);
	const messageWriter = new vscode.BrowserMessageWriter(self);
	const connection = vscode.createConnection(messageReader, messageWriter);

	return connection;
}

export function startLanguageServer(connection: vscode.Connection, ...plugins: LanguageServerPlugin[]) {
	startCommonLanguageServer({
		plugins,
		connection,
		runtimeEnv: {
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
					const uri = shared.fileNameToUri(`${tsdk}/${locale}/diagnosticMessages.generated.json`);
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
