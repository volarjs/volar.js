import * as _fs from 'fs';
import type * as path from 'typesafe-path/posix';
import type * as ts from 'typescript';
import { URI } from 'vscode-uri';

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

export const asFileName = (uri: URI) => uri.fsPath.replace(/\\/g, '/');

export const asUri = (fileName: string) => URI.file(fileName);
