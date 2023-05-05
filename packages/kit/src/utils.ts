import * as path from 'typesafe-path/posix';

export function asPosix(path: string) {
	return path.replace(/\\/g, '/') as path.PosixPath;
}
