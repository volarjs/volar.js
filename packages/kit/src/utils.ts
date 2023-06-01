import * as path from 'typesafe-path/posix';
import { URI } from 'vscode-uri';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { FileSystem, FileType } from '@volar/language-service';
import * as _fs from 'fs';

export const defaultCompilerOptions: ts.CompilerOptions = {
	allowJs: true,
	allowSyntheticDefaultImports: true,
	allowNonTsExtensions: true,
	resolveJsonModule: true,
	jsx: 1 /* ts.JsxEmit.Preserve */,
};

export function asPosix(path: string) {
	return path.replace(/\\/g, '/') as path.PosixPath;
}

export const uriToFileName = (uri: string) => URI.parse(uri).fsPath.replace(/\\/g, '/');

export const fileNameToUri = (fileName: string) => URI.file(fileName).toString();

export function getConfiguration(settings: any, section: string) {
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
}

export const fs: FileSystem = {
	readFile(uri, encoding) {
		return _fs.readFileSync(uriToFileName(uri), { encoding: (encoding as 'utf8') ?? 'utf8' });
	},
	readDirectory(uri) {
		if (uri.startsWith('file://')) {
			const dirName = uriToFileName(uri);
			const files = _fs.existsSync(dirName) ? _fs.readdirSync(dirName, { withFileTypes: true }) : [];
			return files.map<[string, FileType]>(file => {
				return [file.name, file.isFile() ? FileType.File
					: file.isDirectory() ? FileType.Directory
						: file.isSymbolicLink() ? FileType.SymbolicLink
							: FileType.Unknown];
			});
		}
		return [];
	},
	stat(uri) {
		if (uri.startsWith('file://')) {
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
	},
};
