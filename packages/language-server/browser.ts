import * as vscode from 'vscode-languageserver/browser';
import { listenEditorSettings, provider as httpFsProvider } from './lib/fileSystemProviders/http';
import { createServerBase } from './lib/server';

export * from 'vscode-languageserver/browser';
export * from './index';
export * from './lib/project/simpleProject';
export * from './lib/server';

export function createConnection() {
	const messageReader = new vscode.BrowserMessageReader(self);
	const messageWriter = new vscode.BrowserMessageWriter(self);
	const connection = vscode.createConnection(messageReader, messageWriter);

	return connection;
}

export function createServer(connection: vscode.Connection) {
	const server = createServerBase(connection, {
		timer: {
			setImmediate: (callback: (...args: any[]) => void, ...args: any[]) => {
				setTimeout(callback, 0, ...args);
			},
		},
	});
	server.fileSystem.install('http', httpFsProvider);
	server.fileSystem.install('https', httpFsProvider);
	server.onInitialized(() => listenEditorSettings(server));
	return server;
}
