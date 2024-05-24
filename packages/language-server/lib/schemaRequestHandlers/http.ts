import { xhr, XHRResponse, getErrorStatusDescription } from 'request-light';
import type { URI } from 'vscode-uri';

export default function handler(uri: URI) {
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
