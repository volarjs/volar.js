import type * as path from 'typesafe-path/posix';
import { URI } from 'vscode-uri';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as _fs from 'fs';

export const defaultCompilerOptions: ts.CompilerOptions = {
	allowJs: true,
	allowSyntheticDefaultImports: true,
	allowNonTsExtensions: true,
	resolveJsonModule: true,
	jsx: 1 satisfies ts.JsxEmit.Preserve,
};

export function asPosix(path: string) {
	return path.replace(/\\/g, '/') as path.PosixPath;
}

export const uriToFileName = (uri: string) => URI.parse(uri).fsPath.replace(/\\/g, '/');

export const fileNameToUri = (fileName: string) => URI.file(fileName).toString();
