import * as fs from 'fs';
import * as vscode from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import httpSchemaRequestHandler from './lib/common/schemaRequestHandlers/http';
import { startLanguageServerBase } from './lib/common/server';
import { InitializationOptions, BasicServerPlugin, ServerProjectProvider, TypeScriptServerPlugin } from './lib/types';
import { FileSystem, FileType } from '@volar/language-service';
import { createGetCancellationToken } from './lib/node/cancellationPipe';
import { WorkspacesContext, createBasicProjectProvider } from './lib/typescriptServer/basicProjectProvider';
import { createTypeScriptProjectProvider } from './lib/typescriptServer/typescriptProjectProvider';

export * from './index';

export const uriToFileName = (uri: string) => URI.parse(uri).fsPath.replace(/\\/g, '/');

export const fileNameToUri = (fileName: string) => URI.file(fileName).toString();

export function createFs(options: InitializationOptions): FileSystem {
	return {
		stat(uri) {
			if (uri.startsWith('file://')) {
				try {
					const stats = fs.statSync(uriToFileName(uri), { throwIfNoEntry: false });
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
			if (uri.startsWith('file://')) {
				try {
					if (options.maxFileSize) {
						const stats = fs.statSync(uriToFileName(uri), { throwIfNoEntry: false });
						if (stats && stats.size > options.maxFileSize) {
							console.warn(`[volar] file size exceeded limit: ${uri} (${stats.size} > ${options.maxFileSize})`);
							return undefined;
						}
					}
					return fs.readFileSync(uriToFileName(uri), { encoding: encoding as 'utf-8' ?? 'utf-8' });
				}
				catch {
					return undefined;
				}
			}
			if (uri.startsWith('http://') || uri.startsWith('https://')) {
				return httpSchemaRequestHandler(uri);
			}
		},
		readDirectory(uri) {
			if (uri.startsWith('file://')) {
				try {
					const dirName = uriToFileName(uri);
					const files = fs.readdirSync(dirName, { withFileTypes: true });
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
	};
}

export function createConnection() {
	return vscode.createConnection(vscode.ProposedFeatures.all);
}

export function startBasicLanguageServer(
	connection: vscode.Connection,
	...plugins: BasicServerPlugin[]
) {
	return _startLanguageServer(
		connection,
		createBasicProjectProvider,
		...plugins,
	);
}

export function startTypeScriptLanguageServer(
	connection: vscode.Connection,
	...plugins: BasicServerPlugin[]
) {
	return _startLanguageServer(
		connection,
		createTypeScriptProjectProvider,
		...plugins,
	);
}

function _startLanguageServer(
	connection: vscode.Connection,
	createProjectProvider: (context: WorkspacesContext, plugins: ReturnType<TypeScriptServerPlugin>[]) => ServerProjectProvider,
	...plugins: BasicServerPlugin[]
) {
	startLanguageServerBase(connection, plugins, createProjectProvider, (_, options) => ({
		uriToFileName,
		fileNameToUri,
		console: connection.console,
		timer: {
			setImmediate(callback: (...args: any[]) => void, ...args: any[]): vscode.Disposable {
				const handle = setImmediate(callback, ...args);
				return { dispose: () => clearImmediate(handle) };
			},
		},
		loadTypeScript(options) {
			const tsdk = options.typescript && 'tsdk' in options.typescript
				? options.typescript.tsdk
				: undefined;
			if (!tsdk) {
				return;
			}
			for (const name of ['./typescript.js', './tsserverlibrary.js']) {
				try {
					return require(require.resolve(name, { paths: [tsdk] }));
				} catch { }
			}

			// for bun
			for (const name of ['typescript.js', 'tsserverlibrary.js']) {
				try {
					return require(tsdk + '/' + name);
				} catch { }
			}

			throw new Error(`Can't find typescript.js or tsserverlibrary.js in ${tsdk}`);
		},
		async loadTypeScriptLocalized(options, locale) {
			const tsdk = options.typescript && 'tsdk' in options.typescript
				? options.typescript.tsdk
				: undefined;
			if (!tsdk) {
				return;
			}
			try {
				const path = require.resolve(`./${locale}/diagnosticMessages.generated.json`, { paths: [tsdk] });
				return require(path);
			} catch { }
		},
		fs: createFs(options),
		getCancellationToken: createGetCancellationToken(fs, options.cancellationPipeName),
	}));
}
