import * as path from 'typesafe-path';
import { FileType } from 'vscode-html-languageservice';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { FsReadDirectoryRequest, FsReadFileRequest } from '../protocol';
import { FileSystem, FileSystemHost, LanguageServerInitializationOptions, RuntimeEnvironment } from '../types';
import { matchFiles } from './typescript/utilities';
import { createUriMap } from '../common/utils/uriMap';

interface File {
	text?: string;
	exists?: boolean;
	requested?: boolean;
}

interface Dir {
	dirs: Map<string, Dir>;
	files: Map<string, File>;
	exists?: boolean;
	requested?: boolean;
}

export function createWebFileSystemHost(
	_0: any,
	_1: any,
	env: RuntimeEnvironment,
	initOptions: LanguageServerInitializationOptions,
): FileSystemHost {

	const instances = createUriMap<FileSystem>(env.fileNameToUri);
	const onDidChangeWatchedFilesCb = new Set<(params: vscode.DidChangeWatchedFilesParams) => void>();
	const root: Dir = {
		dirs: new Map(),
		files: new Map(),
		requested: false,
	};
	const fetchTasks: [string, string, Promise<void>][] = [];
	const changes: vscode.FileEvent[] = [];
	const onReadyCb: ((connection: vscode.Connection) => void)[] = [];

	let runningRead = false;
	let runningStat = false;
	let connection: vscode.Connection | undefined;

	return {
		ready(_connection) {
			connection = _connection;
			connection.onDidChangeWatchedFiles(params => {
				for (const change of params.changes) {
					const fsPath = env.uriToFileName(change.uri) as path.PosixPath;
					const dir = getDir(path.dirname(fsPath));
					const name = path.basename(fsPath);
					if (!dir.files.has(name)) {
						dir.files.set(name, {});
					}
					if (change.type === vscode.FileChangeType.Created || change.type === vscode.FileChangeType.Changed) {
						dir.files.get(name)!.exists = true;
					}
					else if (change.type === vscode.FileChangeType.Deleted) {
						if (!dir.files.has(name)) {
							dir.files.set(name, {});
						}
					}
				}
				changes.push(...params.changes);
				fireChanges();
			});
			for (const cb of onReadyCb) {
				cb(connection);
			}
			onReadyCb.length = 0;
		},
		reload() {
			root.dirs.clear();
			root.files.clear();
			root.requested = false;
		},
		getWorkspaceFileSystem(rootUri: URI) {
			let sys = instances.uriGet(rootUri.toString());
			if (!sys) {
				sys = createWorkspaceFileSystem(rootUri);
				instances.uriSet(rootUri.toString(), sys);
			}
			return sys;
		},
		onDidChangeWatchedFiles: cb => {
			onDidChangeWatchedFilesCb.add(cb);
			return () => onDidChangeWatchedFilesCb.delete(cb);
		},
	};


	function createWorkspaceFileSystem(rootUri: URI): FileSystem {

		const rootPath = env.uriToFileName(rootUri.toString());

		return {
			newLine: '\n',
			useCaseSensitiveFileNames: false,
			getCurrentDirectory: () => env.uriToFileName(rootUri.toString()),
			fileExists,
			readFile,
			readDirectory,
			getDirectories,
			resolvePath,
			realpath: path => path, // TODO: cannot implement with vscode
		};

		function resolvePath(fsPath: path.OsPath) {
			return path.resolve(fsPath);
		}

		function fileExists(fsPath: path.OsPath): boolean {

			fsPath = resolvePath(fsPath);
			const uri = env.fileNameToUri(fsPath);
			const dirPath = path.dirname(fsPath);

			if (initOptions.typescript?.cdn && uri.startsWith(initOptions.typescript.cdn)) {
				if (!(uri.endsWith('.d.ts') || uri.endsWith('/package.json'))) {
					return false;
				}
				readFile(fsPath);
				const file = getDir(dirPath).files.get(path.basename(fsPath));
				return file?.exists ?? false;
			}

			readDirectory(dirPath);
			const file = getDir(path.dirname(fsPath)).files.get(path.basename(fsPath));
			return file?.exists ?? false;
		}

		function readFile(fsPath: path.OsPath) {

			fsPath = resolvePath(fsPath);
			const uri = env.fileNameToUri(fsPath);
			const dirPath = path.dirname(fsPath);
			const dir = getDir(dirPath);
			const name = path.basename(fsPath);

			if (initOptions.typescript?.cdn && uri.startsWith(initOptions.typescript.cdn)) {
				if (!(uri.endsWith('.d.ts') || uri.endsWith('/package.json'))) {
					return dir.files.get(name)?.text || '';
				}
				readFileWorker();
				return dir.files.get(name)?.text || '';
			}

			readFileWorker();
			return dir.files.get(name)?.text || '';

			function readFileWorker() {
				if (connection) {
					fetch('load', fsPath, readFileAsync(connection, fsPath, dir));
				}
				else {
					onReadyCb.push((connection) => fetch('load', fsPath, readFileAsync(connection, fsPath, dir)));
				}
			}

			async function readFileAsync(connection: vscode.Connection, fsPath: path.OsPath, dir: Dir) {

				const name = path.basename(fsPath);
				if (!dir.files.has(name)) {
					dir.files.set(name, {});
				}
				const file = dir.files.get(name)!;
				if (file.requested) {
					return;
				}
				file.requested = true;

				const uri = env.fileNameToUri(fsPath);
				const data = await connection.sendRequest(FsReadFileRequest.type, resolveRequestUrl(uri));
				const text = data ? new TextDecoder('utf8').decode(data) : undefined;
				if (text?.length) {
					file.exists = true;
					file.text = text;
					changes.push({ uri, type: vscode.FileChangeType.Changed });
				}
			}
		}

		function readDirectory(
			fsPath: path.OsPath,
			extensions?: readonly string[],
			exclude?: readonly string[],
			include?: readonly string[],
			depth?: number,
		) {
			fsPath = resolvePath(fsPath);
			return matchFiles(
				fsPath,
				extensions,
				exclude,
				include,
				false,
				rootPath,
				depth,
				(dirPath) => {

					dirPath = resolvePath(dirPath as path.OsPath);
					readDirectoryWorker(dirPath as path.OsPath);
					const dir = getDir(dirPath as path.OsPath);

					return {
						files: [...dir.files.entries()].filter(([_, file]) => file.exists).map(([name]) => name),
						directories: [...dir.dirs.entries()].filter(([_, dir]) => dir.exists).map(([name]) => name),
					};
				},
				path => path, // TODO
			);
		}

		// for import path completion
		function getDirectories(fsPath: path.OsPath) {
			fsPath = resolvePath(fsPath);
			readDirectoryWorker(fsPath);
			const dir = getDir(fsPath);
			return [...dir.dirs.entries()].filter(([_, dir]) => dir.exists).map(([name]) => name);
		}

		function readDirectoryWorker(fsPath: path.OsPath) {
			if (connection) {
				fetch('directory', fsPath, readDirectoryAsync(connection, fsPath));
			}
			else {
				onReadyCb.push((connection) => fetch('directory', fsPath, readDirectoryAsync(connection, fsPath)));
			}
		}

		async function readDirectoryAsync(connection: vscode.Connection, fsPath: path.OsPath) {

			const dir = getDir(fsPath);
			if (dir.requested) {
				return;
			}
			dir.requested = true;

			const uri = env.fileNameToUri(fsPath);
			const result = await connection.sendRequest(FsReadDirectoryRequest.type, resolveRequestUrl(uri));

			for (const [name, fileType] of result) {
				if (fileType === FileType.File || fileType === FileType.SymbolicLink) {

					if (!dir.files.has(name)) {
						dir.files.set(name, {});
					}

					const file = dir.files.get(name)!;
					if (!file.exists) {
						file.exists = true;

						changes.push({
							uri: env.fileNameToUri(path.join(fsPath, name as path.OsPath)),
							type: vscode.FileChangeType.Created,
						});
					}
				}
				else if (fileType === FileType.Directory && !dir.dirs.has(name)) {
					const childDir = getDirFromDir(dir, name);
					childDir.exists = true;
				}
			}
		}
	}

	async function fetch(action: string, fileName: string, p: Promise<any>) {

		fetchTasks.push([action, fileName, p]);

		if (runningRead === false) {

			let toUpdate: NodeJS.Timeout | undefined;

			runningRead = true;
			const progress = await connection?.window.createWorkDoneProgress();
			progress?.begin('');
			while (fetchTasks.length) {
				const current = fetchTasks.shift()!;
				updateProgress(current[0] + ' ' + URI.parse(env.fileNameToUri(current[1])).fsPath);
				await current[2];
			}
			progress?.done();
			runningRead = false;

			fireChanges();

			function updateProgress(text: string) {
				clearTimeout(toUpdate);
				toUpdate = setTimeout(() => {
					progress?.report(text);
					toUpdate = undefined;
				}, 0);
			}
		}
	}

	function resolveRequestUrl(uri: string) {
		if (initOptions.typescript?.cdn && uri.startsWith(initOptions.typescript.cdn)) {
			let fileName = env.uriToFileName(uri);
			for (const [key, version] of Object.entries(initOptions.typescript.versions || {})) {
				if (fileName.startsWith(`/node_modules/${key}/`)) {
					fileName = fileName.replace(`/node_modules/${key}/`, `/node_modules/${key}@${version}/`);
					return env.fileNameToUri(fileName);
				}
			}
		}
		return uri;
	}

	async function fireChanges() {
		if (runningRead || runningStat) {
			return;
		}
		const _changes = [...changes];
		changes.length = 0;
		for (const cb of [...onDidChangeWatchedFilesCb]) {
			if (onDidChangeWatchedFilesCb.has(cb)) {
				await cb({ changes: _changes });
			}
		}
	}

	function getDir(dirPath: path.OsPath) {

		const dirNames: string[] = [];

		let currentDirPath = dirPath;
		let currentDirName = path.basename(currentDirPath);

		while (currentDirName !== '') {
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
			target = {
				dirs: new Map(),
				files: new Map(),
			};
			dir.dirs.set(name, target);
		}
		return target;
	}
}
