import { type FileSystem, FileType } from '@volar/language-service';
import * as fs from 'fs';

export const provider: FileSystem = {
	stat(uri) {
		try {
			const stats = fs.statSync(uri.fsPath, { throwIfNoEntry: false });
			if (stats) {
				return {
					type: stats.isFile()
						? FileType.File
						: stats.isDirectory()
						? FileType.Directory
						: stats.isSymbolicLink()
						? FileType.SymbolicLink
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
	},
	readFile(uri, encoding) {
		try {
			return fs.readFileSync(uri.fsPath, { encoding: encoding as 'utf-8' ?? 'utf-8' });
		}
		catch {
			return undefined;
		}
	},
	readDirectory(uri) {
		try {
			const files = fs.readdirSync(uri.fsPath, { withFileTypes: true });
			return files.map<[string, FileType]>(file => {
				return [
					file.name,
					file.isFile()
						? FileType.File
						: file.isDirectory()
						? FileType.Directory
						: file.isSymbolicLink()
						? FileType.SymbolicLink
						: FileType.Unknown,
				];
			});
		}
		catch {
			return [];
		}
	},
};
