import type { FileSystem, ServiceEnvironment } from '@volar/language-service';
import type { UriResolver } from './types';

export * from './types';
export * from './cdns/jsdelivr';
export * from './cdns/github';

export function decorateServiceEnvironment(
	env: ServiceEnvironment,
	uriResolver: UriResolver,
	fs: FileSystem
) {
	const _fileNameToUri = env.fileNameToUri;
	const _uriToFileName = env.uriToFileName;
	const _fs = env.fs;
	env.fileNameToUri = fileName => {
		return uriResolver.fileNameToUri(fileName) ?? _fileNameToUri(fileName);
	};
	env.uriToFileName = fileName => {
		return uriResolver.uriToFileName(fileName) ?? _uriToFileName(fileName);
	};
	env.fs = {
		stat(uri) {
			if (uriResolver.uriToFileName(uri)) {
				return fs.stat(uri);
			}
			return _fs?.stat(uri);
		},
		readDirectory(uri) {
			if (uriResolver.uriToFileName(uri)) {
				return fs.readDirectory(uri);
			}
			return _fs?.readDirectory(uri) ?? [];
		},
		readFile(uri) {
			if (uriResolver.uriToFileName(uri)) {
				return fs.readFile(uri);
			}
			return _fs?.readFile(uri);
		},
	};
}
