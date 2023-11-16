import type { FileChangeType, FileType, ServiceEnvironment, Disposable, FileStat } from '@volar/language-service';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as path from 'path-browserify';
import { matchFiles } from './typescript/utilities';

interface File {
	text?: string;
	stat?: FileStat;
	requestedText?: boolean;
	requestedStat?: boolean;
}

interface Dir {
	dirs: Map<string, Dir>;
	files: Map<string, File>;
	exists?: boolean;
	requestedRead?: boolean;
}

let currentCwd = '';

export function createSys(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	env: ServiceEnvironment,
	currentDirectory: string,
): ts.System & {
	version: number;
	sync(): Promise<number>;
} & Disposable {

	let version = 0;

	const rootPath = currentDirectory;
	const sys = ts.sys as ts.System | undefined;
	const root: Dir = {
		dirs: new Map(),
		files: new Map(),
		requestedRead: false,
	};
	const promises = new Set<Thenable<any>>();
	const fileWatcher = env.onDidChangeWatchedFiles?.(({ changes }) => {
		for (const change of changes) {
			const fileName = env.uriToFileName(change.uri);
			const dirName = path.dirname(fileName);
			const baseName = path.basename(fileName);
			const dir = getDir(dirName);
			if (dir.files.has(baseName)) { // is requested file
				version++;
				if (change.type === 1 satisfies typeof FileChangeType.Created || change.type === 2 satisfies typeof FileChangeType.Changed) {
					dir.files.set(baseName, {
						stat: {
							type: 1 satisfies FileType.File,
							ctime: Date.now(),
							mtime: Date.now(),
							size: -1,
						},
						requestedStat: false,
					});
				}
				else if (change.type === 3 satisfies typeof FileChangeType.Deleted) {
					dir.files.set(baseName, {
						stat: undefined,
						text: undefined,
						requestedStat: true,
						requestedText: true,
					});
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
						// @ts-expect-error
						process.chdir(rootPath);
					} catch { }
				}
			}
			return sys.resolvePath(fsPath).replace(/\\/g, '/');
		}
		return path.resolve(fsPath).replace(/\\/g, '/');
	}

	function readFile(fileName: string, encoding?: string) {

		fileName = resolvePath(fileName);
		const dirPath = path.dirname(fileName);
		const dir = getDir(dirPath);
		const name = path.basename(fileName);

		readFileWorker(fileName, encoding, dir);
		return dir.files.get(name)?.text;
	}

	function directoryExists(dirName: string): boolean {

		dirName = resolvePath(dirName);

		const dir = getDir(dirName);
		if (dir.exists === undefined) {
			dir.exists = false;
			const result = env.fs?.stat(env.fileNameToUri(dirName));
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

	function getModifiedTime(fileName: string): Date {
		fileName = resolvePath(fileName);
		const file = getFile(fileName);
		if (!file.requestedStat) {
			file.requestedStat = true;
			handleStat(fileName, file);
		}
		return file.stat ? new Date(file.stat.mtime) : new Date(0);
	}

	function fileExists(fileName: string): boolean {
		fileName = resolvePath(fileName);
		const file = getFile(fileName);
		const exists = () => file.text !== undefined || file.stat?.type === 1 satisfies FileType.File;
		if (exists()) {
			return true;
		}
		if (!file.requestedStat) {
			file.requestedStat = true;
			handleStat(fileName, file);
		}
		return exists();
	}

	function handleStat(fileName: string, file: File) {
		const result = env.fs?.stat(env.fileNameToUri(fileName));
		if (typeof result === 'object' && 'then' in result) {
			const promise = result;
			promises.add(promise);
			result.then(result => {
				promises.delete(promise);
				if (file.stat?.type !== result?.type || file.stat?.mtime !== result?.mtime) {
					version++;
				}
				file.stat = result;
			});
		}
		else {
			file.stat = result;
		}
	}

	function getFile(fileName: string) {

		fileName = resolvePath(fileName);

		const dirPath = path.dirname(fileName);
		const baseName = path.basename(fileName);
		const dir = getDir(dirPath);
		let file = dir.files.get(baseName);
		if (!file) {
			dir.files.set(baseName, file = {});
		}

		return file;
	}

	// for import path completion
	function getDirectories(dirName: string) {
		dirName = resolvePath(dirName);
		readDirectoryWorker(dirName);
		const dir = getDir(dirName);
		return [...dir.dirs.entries()].filter(([_, dir]) => dir.exists).map(([name]) => name);
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
					files: [...dir.files.entries()].filter(([_, file]) => file.stat?.type === 1 satisfies FileType.File).map(([name]) => name),
					directories: [...dir.dirs.entries()].filter(([_, dir]) => dir.exists).map(([name]) => name),
				};
			},
			sys?.realpath ? (path => sys.realpath!(path)) : (path => path),
		);
		return [...new Set(matches)];
	}

	function readFileWorker(fileName: string, encoding: string | undefined, dir: Dir) {

		const name = path.basename(fileName);

		let file = dir.files.get(name);
		if (!file) {
			dir.files.set(name, file = {});
		}

		if (file.requestedText) {
			return;
		}
		file.requestedText = true;

		const uri = env.fileNameToUri(fileName);
		const result = env.fs?.readFile(uri, encoding);

		if (typeof result === 'object' && 'then' in result) {
			const promise = result;
			promises.add(promise);
			result.then(result => {
				promises.delete(promise);
				if (result !== undefined) {
					file!.text = result;
					if (file!.stat) {
						file!.stat.mtime++;
					}
					version++;
				}
			});
		}
		else if (result !== undefined) {
			file.text = result;
		}
	}

	function readDirectoryWorker(dirName: string) {

		const dir = getDir(dirName);
		if (dir.requestedRead) {
			return;
		}
		dir.requestedRead = true;

		const result = env.fs?.readDirectory(env.fileNameToUri(dirName || '.'));

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
							let file = dir.files.get(name);
							if (!file) {
								dir.files.set(name, file = {});
							}
							if (stat.type !== file.stat?.type || stat.mtime !== file.stat?.mtime) {
								version++;
							}
							file.stat = stat;
							file.requestedStat = true;
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
				let file = dir.files.get(name);
				if (!file) {
					dir.files.set(name, file = {});
				}
				if (!file.stat) {
					file.stat = {
						type: 1 satisfies FileType.File,
						mtime: 0,
						ctime: 0,
						size: 0,
					};
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
		let target = dir.dirs.get(name);
		if (!target) {
			dir.dirs.set(name, target = {
				dirs: new Map(),
				files: new Map(),
			});
		}
		return target;
	}
}
