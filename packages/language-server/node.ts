import { FileType } from '@volar/language-service';
import * as fs from 'fs';
import * as vscode from 'vscode-languageserver/node';
import httpSchemaRequestHandler from './lib/schemaRequestHandlers/http';
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
	return createServerBase(connection, {
		stat(uri) {
			if (uri.scheme === 'file') {
				try {
					const stats = fs.statSync(uri.fsPath, { throwIfNoEntry: false });
					if (stats) {
						return {
							type: stats.isFile() ? FileType.File
								: stats.isDirectory() ? FileType.Directory
									: stats.isSymbolicLink() ? FileType.SymbolicLink
										: FileType.Unknown,
							ctime: stats.ctimeMs,
							mtime: stats.mtimeMs,
							size: stats.size,
						};
					}
				}
				catch {
					return undefined;
				}
			}
		},
		readFile(uri, encoding) {
			if (uri.scheme === 'file') {
				try {
					return fs.readFileSync(uri.fsPath, { encoding: encoding as 'utf-8' ?? 'utf-8' });
				}
				catch {
					return undefined;
				}
			}
			if (uri.scheme === 'http' || uri.scheme === 'https') {
				return httpSchemaRequestHandler(uri);
			}
		},
		readDirectory(uri) {
			if (uri.scheme === 'file') {
				try {
					const files = fs.readdirSync(uri.fsPath, { withFileTypes: true });
					return files.map<[string, FileType]>(file => {
						return [file.name, file.isFile() ? FileType.File
							: file.isDirectory() ? FileType.Directory
								: file.isSymbolicLink() ? FileType.SymbolicLink
									: FileType.Unknown];
					});
				}
				catch {
					return [];
				}
			}
			return [];
		},
	});
}

export function loadTsdkByPath(tsdk: string, locale: string | undefined) {

	// webpack compatibility
	const _require: NodeRequire = eval('require');

	return {
		typescript: loadLib(),
		diagnosticMessages: loadLocalizedDiagnosticMessages(),
	};

	function loadLib(): typeof import('typescript') {
		for (const name of ['./typescript.js', './tsserverlibrary.js']) {
			try {
				return _require(_require.resolve(name, { paths: [tsdk] }));
			} catch { }
		}
		// for bun
		for (const name of ['typescript.js', 'tsserverlibrary.js']) {
			try {
				return _require(tsdk + '/' + name);
			} catch { }
		}
		throw new Error(`Can't find typescript.js or tsserverlibrary.js in ${JSON.stringify(tsdk)}`);
	}

	function loadLocalizedDiagnosticMessages(): import('typescript').MapLike<string> | undefined {
		try {
			const path = _require.resolve(`./${locale}/diagnosticMessages.generated.json`, { paths: [tsdk] });
			return _require(path);
		} catch { }
	}
}

