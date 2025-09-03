import * as vscode from 'vscode-languageserver/node';
import { listenEditorSettings, provider as httpFsProvider } from './lib/fileSystemProviders/http';
import { provider as nodeFsProvider } from './lib/fileSystemProviders/node';
import { createServerBase } from './lib/server';

export * from 'vscode-languageserver/node';
export * from './index';
export * from './lib/project/simpleProject';
export * from './lib/project/typescriptProject';
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

export function loadTsdkByPath(tsdk: string, locale: string | undefined) {
	locale = locale?.toLowerCase();

	// webpack compatibility
	const _require: NodeJS.Require = eval('require');

	return {
		typescript: loadLib(),
		diagnosticMessages: loadLocalizedDiagnosticMessages(),
	};

	function loadLib(): typeof import('typescript') {
		for (const name of ['./typescript.js', './tsserverlibrary.js']) {
			try {
				return _require(_require.resolve(name, { paths: [tsdk] }));
			}
			catch {}
		}
		// for bun
		for (const name of ['typescript.js', 'tsserverlibrary.js']) {
			try {
				return _require(tsdk + '/' + name);
			}
			catch {}
		}
		throw new Error(`Can't find typescript.js or tsserverlibrary.js in ${JSON.stringify(tsdk)}`);
	}

	function loadLocalizedDiagnosticMessages(): import('typescript').MapLike<string> | undefined {
		if (locale === 'en') {
			return;
		}
		try {
			const path = _require.resolve(`./${locale}/diagnosticMessages.generated.json`, { paths: [tsdk] });
			return _require(path);
		}
		catch {}
	}
}
