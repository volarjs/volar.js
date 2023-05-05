import * as path from 'typesafe-path/posix';
import { URI } from 'vscode-uri';

export function asPosix(path: string) {
	return path.replace(/\\/g, '/') as path.PosixPath;
}

export const uriToFileName = (uri: string) => URI.parse(uri).fsPath.replace(/\\/g, '/');

export const fileNameToUri = (fileName: string) => URI.file(fileName).toString();
