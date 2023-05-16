import * as fs from 'fs';
import { configure as configureHttpRequests } from 'request-light';
import * as html from 'vscode-html-languageservice';
import * as vscode from 'vscode-languageserver/node';
import { ServerContext, startCommonLanguageServer } from '../common/server';
import fileSchemaRequestHandler from '../common/schemaRequestHandlers/file';
import httpSchemaRequestHandler from '../common/schemaRequestHandlers/http';
import { createNodeFileSystemHost } from './fileSystem';
import { LanguageServerPlugin } from '../types';
import { URI } from 'vscode-uri';

export * from '../index';

export function createConnection() {
	return vscode.createConnection(vscode.ProposedFeatures.all);
}

export function startLanguageServer(connection: vscode.Connection, ...plugins: LanguageServerPlugin[]) {

	const uriToFileName = (uri: string) => URI.parse(uri).fsPath.replace(/\\/g, '/');
	const fileNameToUri = (fileName: string) => URI.file(fileName).toString();

	startCommonLanguageServer(connection, (): ServerContext['server'] => {
		return {
			plugins,
			connection,
			runtimeEnv: {
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
				schemaRequestHandlers: {
					file: fileSchemaRequestHandler,
					http: httpSchemaRequestHandler,
					https: httpSchemaRequestHandler,
				},
				onDidChangeConfiguration(settings) {
					configureHttpRequests(settings.http?.proxy, settings.http?.proxyStrictSSL);
				},
				createFileSystemHost: createNodeFileSystemHost,
				fileSystemProvide: {
					stat: (uri) => {
						return new Promise<html.FileStat>((resolve, reject) => {
							fs.stat(uriToFileName(uri), (err, stats) => {
								if (stats) {
									resolve({
										type: stats.isFile() ? html.FileType.File
											: stats.isDirectory() ? html.FileType.Directory
												: stats.isSymbolicLink() ? html.FileType.SymbolicLink
													: html.FileType.Unknown,
										ctime: stats.ctimeMs,
										mtime: stats.mtimeMs,
										size: stats.size,
									});
								}
								else {
									reject(err);
								}
							});
						});
					},
					readDirectory: (uri) => {
						return new Promise<[string, html.FileType][]>((resolve, reject) => {
							fs.readdir(uriToFileName(uri), (err, files) => {
								if (files) {
									resolve(files.map(file => [file, html.FileType.File]));
								}
								else {
									reject(err);
								}
							});
						});
					},
				},
			},
		};
	});
}
