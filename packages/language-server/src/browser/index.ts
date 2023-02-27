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
		const parsed = URI.parse(uri);
		if (uri.startsWith('https://unpkg.com/')) {
			return parsed.toString(true).replace('https://unpkg.com/', '/node_modules/');
		}
		return `/${parsed.scheme}${parsed.authority ? '@' + parsed.authority : ''}${parsed.path}`;
	};
	const fileNameToUri = (fileName: string) => {
		if (fileName.startsWith('/node_modules/')) {
			return URI.parse(fileName.replace('/node_modules/', 'https://unpkg.com/')).toString();
		}
		const parts = fileName.split('/');
		if (parts.length < 2) {
			console.error('Invalid file name', fileName);
			return URI.file(fileName).toString();
		}
		const firstParts = parts[1].split('@');
		return URI.from({
			scheme: firstParts[0],
			authority: firstParts.length > 1 ? firstParts[1] : undefined,
			path: '/' + parts.slice(2).join('/'),
		}).toString();
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
