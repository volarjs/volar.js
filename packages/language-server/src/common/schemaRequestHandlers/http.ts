import { getErrorStatusDescription, xhr, type XHRResponse } from 'request-light';

export default function handler(uri: string) {
	const headers = { 'Accept-Encoding': 'gzip, deflate' };
	return xhr({ url: uri, followRedirects: 5, headers }).then(response => {
		if (response.status !== 200) {
			return;
		}
		return response.responseText;
	}, (error: XHRResponse) => {
		return Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error.toString());
	});
}
