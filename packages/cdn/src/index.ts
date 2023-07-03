import type { FileSystem, ServiceEnvironment } from '@volar/language-service';
import type { UriResolver } from './types';

export * from './types';
export * from './jsdelivr';

export function decorateServiceEnvironment(
	env: ServiceEnvironment,
	jsDelivrUriResolver: UriResolver,
	jsDelivrFs: FileSystem
) {
	const fileNameToUri = env.fileNameToUri;
	const uriToFileName = env.uriToFileName;
	const fs = env.fs;
	env.fileNameToUri = fileName => {
		return jsDelivrUriResolver.fileNameToUri(fileName) ?? fileNameToUri(fileName);
	};
	env.uriToFileName = fileName => {
		return jsDelivrUriResolver.uriToFileName(fileName) ?? uriToFileName(fileName);
	};
	env.fs = {
		stat(uri) {
			if (jsDelivrUriResolver.uriToFileName(uri)) {
				return jsDelivrFs.stat(uri);
			}
			return fs?.stat(uri);
		},
		readDirectory(uri) {
			if (jsDelivrUriResolver.uriToFileName(uri)) {
				return jsDelivrFs.readDirectory(uri);
			}
			return fs?.readDirectory(uri) ?? [];
		},
		readFile(uri) {
			if (jsDelivrUriResolver.uriToFileName(uri)) {
				return jsDelivrFs.readFile(uri);
			}
			return fs?.readFile(uri);
		},
	};
}
