import * as vscode from 'vscode-languageserver/node';
import { listenEditorSettings, provider as httpFsProvider } from './lib/fileSystemProviders/http';
import { provider as nodeFsProvider } from './lib/fileSystemProviders/node';
import { createServerBase } from './lib/server';

export * from 'vscode-languageserver/node';
export * from './index';
export * from './lib/project/simpleProject';
export * from './lib/server';

export function createConnection() {
	return vscode.createConnection(vscode.ProposedFeatures.all);
}

export function createServer(connection: vscode.Connection) {
	const server = createServerBase(connection, {
		timer: {
			setImmediate: setImmediate,
		},
	});
	server.fileSystem.install('file', nodeFsProvider);
	server.fileSystem.install('http', httpFsProvider);
	server.fileSystem.install('https', httpFsProvider);
	server.onInitialized(() => listenEditorSettings(server));
	return server;
}
