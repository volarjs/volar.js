import { FileType } from '@volar/language-service';
import * as vscode from 'vscode-languageserver/browser';
import { URI } from 'vscode-uri';
import httpSchemaRequestHandler from './lib/schemaRequestHandlers/http';
import { createServerBase } from './lib/server';
import { FsReadDirectoryRequest, FsReadFileRequest, FsStatRequest } from './protocol';

export * from 'vscode-languageserver/browser';
export * from './index';
export * from './lib/project/simpleProjectProvider';
export * from './lib/project/typescriptProjectProvider';
export * from './lib/server';

export function createConnection() {

	const messageReader = new vscode.BrowserMessageReader(self);
	const messageWriter = new vscode.BrowserMessageWriter(self);
	const connection = vscode.createConnection(messageReader, messageWriter);

	return connection;
}

export function createServer(connection: vscode.Connection) {
	return createServerBase(connection, () => ({
		async stat(uri) {
			if (uri.scheme === 'http' || uri.scheme === 'https') { // perf
				const text = await this.readFile(uri);
				if (text !== undefined) {
					return {
						type: FileType.File,
						size: text.length,
						ctime: -1,
						mtime: -1,
					};
				}
				return undefined;
			}
			return await connection.sendRequest(FsStatRequest.type, uri.toString());
		},
		async readFile(uri) {
			if (uri.scheme === 'http' || uri.scheme === 'https') { // perf
				return await httpSchemaRequestHandler(uri);
			}
			return await connection.sendRequest(FsReadFileRequest.type, uri.toString()) ?? undefined;
		},
		async readDirectory(uri) {
			if (uri.scheme === 'http' || uri.scheme === 'https') { // perf
				return [];
			}
			return await connection.sendRequest(FsReadDirectoryRequest.type, uri.toString());
		},
	}));
}

export async function loadTsdkByUrl(tsdkUrl: string, locale: string | undefined) {

	return {
		typescript: await loadLib(),
		diagnosticMessages: await loadLocalizedDiagnosticMessages(),
	};

	async function loadLib(): Promise<typeof import('typescript')> {
		const originalModule = globalThis.module;
		try {
			globalThis.module = { exports: {} } as typeof originalModule;
			await import(`${tsdkUrl}/typescript.js`);
			return globalThis.module.exports as typeof import('typescript');
		} finally {
			globalThis.module = originalModule;
		}
	}

	async function loadLocalizedDiagnosticMessages(): Promise<import('typescript').MapLike<string> | undefined> {
		try {
			const json = await httpSchemaRequestHandler(URI.parse(`${tsdkUrl}/${locale}/diagnosticMessages.generated.json`));
			if (json) {
				return JSON.parse(json);
			}
		}
		catch { }
	}
}
