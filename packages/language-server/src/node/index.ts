import * as fs from 'fs';
// import { configure as configureHttpRequests } from 'request-light';
import * as vscode from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import httpSchemaRequestHandler from '../common/schemaRequestHandlers/http';
import { startCommonLanguageServer } from '../common/server';
import { LanguageServerPlugin } from '../types';
import { FileType } from '@volar/language-service';

export * from '../index';

export function createConnection() {
	return vscode.createConnection(vscode.ProposedFeatures.all);
}

export function startLanguageServer(connection: vscode.Connection, ...plugins: LanguageServerPlugin[]) {

	const uriToFileName = (uri: string) => URI.parse(uri).fsPath.replace(/\\/g, '/');
	const fileNameToUri = (fileName: string) => URI.file(fileName).toString();

	startCommonLanguageServer(connection, plugins, () => ({
		uriToFileName,
		fileNameToUri,
		timer: {
			setImmediate(callback: (...args: any[]) => void, ...args: any[]): vscode.Disposable {
				const handle = setImmediate(callback, ...args);
				return { dispose: () => clearImmediate(handle) };
			},
		},
		loadTypescript(tsdk) {
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
		async loadTypescriptLocalized(tsdk, locale) {
			try {
				const path = require.resolve(`./${locale}/diagnosticMessages.generated.json`, { paths: [tsdk] });
				return require(path);
			} catch { }
		},
		// TODO
		// onDidChangeConfiguration(settings) {
		// 	configureHttpRequests(settings.http?.proxy, settings.http?.proxyStrictSSL);
		// },
		fs: {
			stat(uri) {
				if (uri.startsWith('file://')) {
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
			},
			readFile(uri, encoding) {
				if (uri.startsWith('file://')) {
					try {
						return fs.readFileSync(uriToFileName(uri), { encoding: encoding as 'utf-8' ?? 'utf-8' });
					} catch {
						return undefined;
					}
				}
				if (uri.startsWith('http://') || uri.startsWith('https://')) {
					return httpSchemaRequestHandler(uri);
				}
			},
			readDirectory(uri) {
				if (uri.startsWith('file://')) {
					const dirName = uriToFileName(uri);
					const files = fs.existsSync(dirName) ? fs.readdirSync(dirName, { withFileTypes: true }) : [];
					return files.map<[string, FileType]>(file => {
						return [file.name, file.isFile() ? FileType.File
							: file.isDirectory() ? FileType.Directory
								: file.isSymbolicLink() ? FileType.SymbolicLink
									: FileType.Unknown];
					});
				}
				return [];
			},
		},
	}));
}
