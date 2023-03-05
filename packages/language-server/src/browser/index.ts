import { configure as configureHttpRequests } from 'request-light';
import * as vscode from 'vscode-languageserver/browser';
import { ServerContext, startCommonLanguageServer } from '../common/server';
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
	startCommonLanguageServer(connection, (options): ServerContext => {

		return {
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
		};

		function uriToFileName(uri: string) {
			const parsed = URI.parse(uri);
			if (options.typescript?.cdn && uri.startsWith(options.typescript.cdn)) {
				return parsed.toString(true).replace(options.typescript.cdn, '/node_modules/');
			}
			return `/${parsed.scheme}${parsed.authority ? '@' + parsed.authority : ''}${parsed.path}`;
		};

		function fileNameToUri(fileName: string) {
			if (fileName.startsWith('/node_modules/') && options.typescript?.cdn) {
				return URI.parse(fileName.replace('/node_modules/', options.typescript.cdn)).toString();
			}
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
	});
}
