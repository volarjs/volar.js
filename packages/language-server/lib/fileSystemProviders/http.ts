import { FileSystem, FileType } from '@volar/language-service';
import { configure as configureHttpRequests, getErrorStatusDescription, xhr, XHRResponse } from 'request-light';
import type { URI } from 'vscode-uri';
import { LanguageServer } from '../types';

let server: LanguageServer | undefined;
let initialized = false;

export const provider: FileSystem = {
	async stat(uri) {
		await initialize();
		const text = await this.readFile(uri);
		if (text !== undefined) {
			return {
				type: FileType.File,
				size: text.length,
				ctime: 0,
				mtime: 0,
			};
		}
	},
	async readFile(uri) {
		await initialize();
		return handler(uri);
	},
	readDirectory() {
		return [];
	},
};

export function setServer(_server: LanguageServer) {
	server = _server;
}

async function initialize() {
	if (initialized || !server) {
		return;
	}
	initialized = true;
	server.configurations.onDidChange(updateHttpSettings);
	await updateHttpSettings();
}

async function updateHttpSettings() {
	const httpSettings = await server?.configurations.get<{ proxyStrictSSL?: boolean; proxy?: string; }>('http');
	configureHttpRequests(httpSettings?.proxy, httpSettings?.proxyStrictSSL ?? false);
}

export function handler(uri: URI) {
	const headers = { 'Accept-Encoding': 'gzip, deflate' };
	return xhr({ url: uri.toString(true), followRedirects: 5, headers }).then(response => {
		if (response.status !== 200) {
			return;
		}
		return response.responseText;
	}, (error: XHRResponse) => {
		return Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error.toString());
	});
}
