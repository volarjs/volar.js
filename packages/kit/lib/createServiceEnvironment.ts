import { DidChangeWatchedFilesParams, FileSystem, FileType, NotificationHandler, ServiceEnvironment } from '@volar/language-service';
import { fileNameToUri, uriToFileName } from './utils';
import * as _fs from 'fs';
import { URI } from 'vscode-uri';

export function createServiceEnvironment(settings: any = {}): ServiceEnvironment {

	const didChangeWatchedFilesCallbacks = new Set<NotificationHandler<DidChangeWatchedFilesParams>>();

	return {
		workspaceFolder: {
			uri: URI.file(process.cwd()),
			name: '',
		},
		uriToFileName,
		fileNameToUri,
		onDidChangeWatchedFiles(cb) {
			didChangeWatchedFilesCallbacks.add(cb);
			return {
				dispose: () => {
					didChangeWatchedFilesCallbacks.delete(cb);
				},
			};
		},
		getConfiguration(section: string) {
			if (section in settings) {
				return settings[section];
			}
			let result: any;
			for (const settingKey in settings) {
				if (settingKey.startsWith(`${section}.`)) {
					const value = settings[settingKey];
					const props = settingKey.substring(section.length + 1).split('.');
					result ??= {};
					let current = result;
					while (props.length > 1) {
						const prop = props.shift()!;
						if (typeof current[prop] !== 'object') {
							current[prop] = {};
						}
						current = current[prop];
					}
					current[props.shift()!] = value;
				}
			}
			return result;
		},
		fs,
		console,
	};
}

const fs: FileSystem = {
	stat(uri) {
		if (uri.startsWith('file://')) {
			try {
				const stats = _fs.statSync(uriToFileName(uri), { throwIfNoEntry: false });
				if (stats) {
					return {
						type: stats.isFile() ? FileType.File
							: stats.isDirectory() ? FileType.Directory
								: stats.isSymbolicLink() ? FileType.SymbolicLink
									: FileType.Unknown,
						ctime: stats.ctimeMs,
						mtime: stats.mtimeMs,
						size: stats.size,
					};
				}
			}
			catch {
				return undefined;
			}
		}
	},
	readFile(uri, encoding) {
		if (uri.startsWith('file://')) {
			try {
				return _fs.readFileSync(uriToFileName(uri), { encoding: encoding as 'utf-8' ?? 'utf-8' });
			}
			catch {
				return undefined;
			}
		}
	},
	readDirectory(uri) {
		if (uri.startsWith('file://')) {
			try {
				const dirName = uriToFileName(uri);
				const files = _fs.readdirSync(dirName, { withFileTypes: true });
				return files.map<[string, FileType]>(file => {
					return [file.name, file.isFile() ? FileType.File
						: file.isDirectory() ? FileType.Directory
							: file.isSymbolicLink() ? FileType.SymbolicLink
								: FileType.Unknown];
				});
			}
			catch {
				return [];
			}
		}
		return [];
	},
};
