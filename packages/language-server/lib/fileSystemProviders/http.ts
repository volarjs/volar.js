import { FileSystem, FileType } from '@volar/language-service';
import { xhr, XHRResponse, getErrorStatusDescription } from 'request-light';
import type { URI } from 'vscode-uri';

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
