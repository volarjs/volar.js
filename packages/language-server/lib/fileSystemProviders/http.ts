import { type FileSystem, FileType } from '@volar/language-service';
import { configure as configureHttpRequests, getErrorStatusDescription, xhr, type XHRResponse } from 'request-light';
import type { URI } from 'vscode-uri';
import { type LanguageServer } from '../types';

export const provider: FileSystem = {
	async stat(uri) {
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
	readFile(uri) {
		return handler(uri);
	},
	readDirectory() {
		return [];
	},
};

export function listenEditorSettings(server: LanguageServer) {
	server.configurations.onDidChange(updateHttpSettings);
	updateHttpSettings();

	async function updateHttpSettings() {
		const httpSettings = await server.configurations.get<{ proxyStrictSSL?: boolean; proxy?: string }>('http');
		configureHttpRequests(httpSettings?.proxy, httpSettings?.proxyStrictSSL ?? false);
	}
}

export function handler(uri: URI) {
	const headers = { 'Accept-Encoding': 'gzip, deflate' };
	return xhr({ url: uri.toString(true), followRedirects: 5, headers }).then(response => {
		if (response.status !== 200) {
			return;
		}
		return response.responseText;
	}, (error: XHRResponse) => {
		return Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error);
	});
}
