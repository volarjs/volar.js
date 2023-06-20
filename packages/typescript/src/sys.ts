import type { FileChangeType, FileType, ServiceEnvironment, Disposable } from '@volar/language-service';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { posix as path } from 'path';
import { matchFiles } from './typescript/utilities';
import { IDtsHost, getPackageNameOfDtsPath } from './dtsHost';

interface File {
	text?: string;
	modifiedTime?: number;
	exists?: boolean;
	requested?: boolean;
}

interface Dir {
	dirs: Record<string, Dir>;
	files: Record<string, File>;
	exists?: boolean;
	requested?: boolean;
}

let currentCwd = '';

export function createSys(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	env: ServiceEnvironment,
	dtsHost?: IDtsHost,
): ts.System & {
	version: number;
	sync(): Promise<number>;
} & Disposable {

	let version = 0;

	const rootPath = env.uriToFileName(env.rootUri.toString());
	const sys = ts.sys as ts.System | undefined;
	const root: Dir = {
		dirs: {},
		files: {},
		requested: false,
	};
	const promises = new Set<Thenable<any>>();
	const fileWatcher = env.onDidChangeWatchedFiles?.(({ changes }) => {
		for (const change of changes) {
			const fileName = env.uriToFileName(change.uri);
			const dirName = path.dirname(fileName);
			const baseName = path.basename(fileName);
			const dir = getDir(dirName);
			if (dir.files[baseName]) { // is requested file
				version++;
				if (change.type === 1 satisfies typeof FileChangeType.Created) {
					dir.files[baseName] = { exists: true };
				}
				else if (change.type === 2 satisfies typeof FileChangeType.Changed) {
					dir.files[baseName] = { exists: true };
				}
				else if (change.type === 3 satisfies typeof FileChangeType.Deleted) {
					dir.files[baseName] = { exists: false };
				}
			}
		}
	});

	return {
		get version() {
			return version;
		},
		dispose() {
			fileWatcher?.dispose();
		},
		args: sys?.args ?? [],
		newLine: sys?.newLine ?? '\n',
		useCaseSensitiveFileNames: sys?.useCaseSensitiveFileNames ?? false,
		realpath: sys?.realpath,
		write: sys?.write ?? (() => { }),
		writeFile: sys?.writeFile ?? (() => { }),
		createDirectory: sys?.createDirectory ?? (() => { }),
		exit: sys?.exit ?? (() => { }),
		getExecutingFilePath: sys?.getExecutingFilePath ?? (() => rootPath + '/__fake__.js'),
		getCurrentDirectory: () => rootPath,
		getModifiedTime,
		readFile,
		readDirectory,
		getDirectories,
		resolvePath,
		fileExists,
		directoryExists,
		async sync() {
			while (promises.size) {
				await Promise.all(promises);
			}
			return version;
		},
	};

	function resolvePath(fsPath: string) {
		if (sys) {
			if (currentCwd !== rootPath) {
				currentCwd = rootPath;
				// https://github.com/vuejs/language-tools/issues/2039
				// https://github.com/vuejs/language-tools/issues/2234
				if (sys.directoryExists(rootPath)) {
					// https://github.com/vuejs/language-tools/issues/2480
					try {
						process.chdir(rootPath);
					} catch { }
				}
			}
			return sys.resolvePath(fsPath).replace(/\\/g, '/');
		}
		return path.resolve(fsPath).replace(/\\/g, '/');
	}

	function getModifiedTime(fileName: string) {
		fileName = resolvePath(fileName);
		const dirPath = path.dirname(fileName);
		const dir = getDir(dirPath);
		const name = path.basename(fileName);
		const modifiedTime = dir.files[name]?.modifiedTime;
		if (modifiedTime !== undefined) {
			return new Date(modifiedTime);
		}
	}

	function readFile(fileName: string, encoding?: string) {

		fileName = resolvePath(fileName);
		const dirPath = path.dirname(fileName);
		const dir = getDir(dirPath);
		const name = path.basename(fileName);

		readFileWorker(fileName, encoding, dir);

		return dir.files[name]?.text;
	}

	function directoryExists(dirName: string): boolean {

		dirName = resolvePath(dirName);

		const dir = getDir(dirName);
		if (dirName === '/node_modules' && dtsHost) {
			dir.exists = true;
		}
		else if (dirName.startsWith('/node_modules/') && dtsHost && !getPackageNameOfDtsPath(dirName)) {
			dir.exists = true;
		}
		else if (dir.exists === undefined) {
			dir.exists = false;
			const result = dirName.startsWith('/node_modules/') && dtsHost
				? dtsHost.stat(dirName)
				: env.fs?.stat(env.fileNameToUri(dirName));
			if (typeof result === 'object' && 'then' in result) {
				const promise = result;
				promises.add(promise);
				result.then(result => {
					promises.delete(promise);
					dir.exists = result?.type === 2 satisfies FileType.Directory;
					if (dir.exists) {
						version++;
					}
				});
			}
			else {
				dir.exists = result?.type === 2 satisfies FileType.Directory;
			}
		}
		return dir.exists;
	}

	function fileExists(fileName: string): boolean {

		fileName = resolvePath(fileName);

		const dirPath = path.dirname(fileName);
		const baseName = path.basename(fileName);
		const dir = getDir(dirPath);
		const file = dir.files[baseName] ??= {};
		if (file.exists === undefined) {
			file.exists = false;
			const result = fileName.startsWith('/node_modules/') && dtsHost
				? dtsHost.stat(fileName)
				: env.fs?.stat(env.fileNameToUri(fileName));
			if (typeof result === 'object' && 'then' in result) {
				const promise = result;
				promises.add(promise);
				result.then(result => {
					promises.delete(promise);
					file.exists = result?.type === 1 satisfies FileType.File;
					if (file.exists) {
						const time = Date.now();
						file.modifiedTime = time !== file.modifiedTime ? time : file.modifiedTime + 1;
						version++;
					}
				});
			}
			else {
				file.exists = result?.type === 1 satisfies FileType.File;
			}
		}
		return file.exists;
	}

	// for import path completion
	function getDirectories(dirName: string) {
		dirName = resolvePath(dirName);
		readDirectoryWorker(dirName);
		const dir = getDir(dirName);
		return [...Object.entries(dir.dirs)].filter(([_, dir]) => dir.exists).map(([name]) => name);
	}

	function readDirectory(
		dirName: string,
		extensions?: readonly string[],
		excludes?: readonly string[],
		includes?: readonly string[],
		depth?: number,
	) {
		dirName = resolvePath(dirName);
		const matches = matchFiles(
			dirName,
			extensions,
			excludes,
			includes,
			sys?.useCaseSensitiveFileNames ?? false,
			rootPath,
			depth,
			(dirPath) => {

				dirPath = resolvePath(dirPath);
				readDirectoryWorker(dirPath);
				const dir = getDir(dirPath);

				return {
					files: [...Object.entries(dir.files)].filter(([_, file]) => file.exists).map(([name]) => name),
					directories: [...Object.entries(dir.dirs)].filter(([_, dir]) => dir.exists).map(([name]) => name),
				};
			},
			sys?.realpath ? (path => sys.realpath!(path)) : (path => path),
		);
		return [...new Set(matches)];
	}

	function readFileWorker(fileName: string, encoding: string | undefined, dir: Dir) {

		const name = path.basename(fileName);
		dir.files[name] ??= {};

		const file = dir.files[name];
		if (file.exists === false || file.requested) {
			return;
		}
		file.requested = true;

		const uri = env.fileNameToUri(fileName);
		const result = fileName.startsWith('/node_modules/') && dtsHost
			? dtsHost.readFile(fileName)
			: env.fs?.readFile(uri, encoding);

		if (typeof result === 'object' && 'then' in result) {
			const promise = result;
			promises.add(promise);
			result.then(result => {
				promises.delete(promise);
				if (result !== undefined) {
					file.exists = true;
					file.text = result;
					const time = Date.now();
					file.modifiedTime = time !== file.modifiedTime ? time : time + 1;
					version++;
				}
				else {
					file.exists = false;
				}
			});
		}
		else if (result !== undefined) {
			file.exists = true;
			file.text = result;
			const time = Date.now();
			file.modifiedTime = time !== file.modifiedTime ? time : time + 1;
		}
		else {
			file.exists = false;
		}
	}

	function readDirectoryWorker(dirName: string) {

		const dir = getDir(dirName);
		if (dir.requested) {
			return;
		}
		dir.requested = true;

		const result = dirName.startsWith('/node_modules/') && dtsHost
			? dtsHost.readDirectory(dirName)
			: env.fs?.readDirectory(env.fileNameToUri(dirName || '.'));

		if (typeof result === 'object' && 'then' in result) {
			const promise = result;
			promises.add(promise);
			result.then((result) => {
				promises.delete(promise);
				if (onReadDirectoryResult(dirName, dir, result)) {
					version++;
				}
			});
		}
		else {
			onReadDirectoryResult(dirName, dir, result ?? []);
		}
	}

	function onReadDirectoryResult(dirName: string, dir: Dir, result: [string, FileType][]) {

		// See https://github.com/microsoft/TypeScript/blob/e1a9290051a3b0cbdfbadc3adbcc155a4641522a/src/compiler/sys.ts#L1853-L1857
		result = result.filter(([name]) => name !== '.' && name !== '..');

		let updated = false;
		for (const [name, _fileType] of result) {
			let fileType = _fileType;
			if (fileType === 64 satisfies FileType.SymbolicLink) {
				const stat = env.fs?.stat(env.fileNameToUri(dirName + '/' + name));
				if (typeof stat === 'object' && 'then' in stat) {
					const promise = stat;
					promises.add(promise);
					stat.then((stat) => {
						promises.delete(promise);
						if (stat?.type === 1 satisfies FileType.File) {
							dir.files[name] ??= {};
							if (!dir.files[name].exists) {
								dir.files[name].exists = true;
								version++;
							}
						}
						else if (stat?.type === 2 satisfies FileType.Directory) {
							const childDir = getDirFromDir(dir, name);
							if (!childDir.exists) {
								childDir.exists = true;
								version++;
							}
						}
					});
				}
				else if (stat) {
					fileType = stat.type;
				}
			}
			if (fileType === 1 satisfies FileType.File) {
				dir.files[name] ??= {};
				if (!dir.files[name].exists) {
					dir.files[name].exists = true;
					updated = true;
				}
			}
			else if (fileType === 2 satisfies FileType.Directory) {
				const childDir = getDirFromDir(dir, name);
				if (!childDir.exists) {
					childDir.exists = true;
					updated = true;
				}
			}
		}
		return updated;
	}

	function getDir(dirName: string) {

		const dirNames: string[] = [];

		let currentDirPath = dirName;
		let currentDirName = path.basename(currentDirPath);
		let lastDirPath: string | undefined;

		while (lastDirPath !== currentDirPath) {
			lastDirPath = currentDirPath;
			dirNames.push(currentDirName);
			currentDirPath = path.dirname(currentDirPath);
			currentDirName = path.basename(currentDirPath);
		}

		let currentDir = root;

		for (let i = dirNames.length - 1; i >= 0; i--) {
			const nextDirName = dirNames[i];
			currentDir = getDirFromDir(currentDir, nextDirName);
		}

		return currentDir;
	}

	function getDirFromDir(dir: Dir, name: string) {
		let target = dir.dirs[name];
		if (!target) {
			target = {
				dirs: {},
				files: {},
			};
			dir.dirs[name] = target;
		}
		return target;
	}
}
