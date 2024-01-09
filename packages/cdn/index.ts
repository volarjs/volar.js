import type { FileSystem, ServiceEnvironment } from '@volar/language-service';

export * from './lib/cdns/jsdelivr';
export * from './lib/cdns/github';

export function decorateServiceEnvironment(
	env: ServiceEnvironment,
	fs: FileSystem
) {
	const _fs = env.fs;
	env.fs = {
		async stat(uri) {
			return await fs.stat(uri) ?? await _fs?.stat(uri);
		},
		async readDirectory(uri) {
			return await fs.readDirectory(uri) ?? await _fs?.readDirectory(uri) ?? [];
		},
		async readFile(uri) {
			return await fs.readFile(uri) ?? await _fs?.readFile(uri);
		},
	};
}
