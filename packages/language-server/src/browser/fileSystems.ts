import * as path from 'typesafe-path';
import { FileStat, FileType } from 'vscode-html-languageservice';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { FsReadDirectoryRequest, FsReadFileRequest, FsStatRequest } from '../protocol';
import { FileSystem, FileSystemHost, LanguageServerInitializationOptions, RuntimeEnvironment } from '../types';
import { matchFiles } from './typescript/utilities';
import { createUriMap } from '../common/utils/uriMap';
import * as shared from '@volar/shared';

let currentCwd = '/';

interface Dir {
	dirs: Map<string, Dir>,
	fileTexts: Map<string, string>,
	fileTypes: Map<string, FileType | undefined>,
	searched: boolean,
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
		fileTexts: new Map(),
		fileTypes: new Map(),
		searched: false,
	};
	const fetchTasks: [string, string, Promise<void>][] = [];
	const changes: vscode.FileEvent[] = [];
	const onReadyCb: ((connection: vscode.Connection) => void)[] = [];
	const statRequests: string[] = [];

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
					if (change.type === vscode.FileChangeType.Created) {
						dir.fileTypes.set(name, FileType.File);
					}
					else if (change.type === vscode.FileChangeType.Changed) {
						dir.fileTypes.set(name, FileType.File);
						dir.fileTexts.delete(name);
					}
					else if (change.type === vscode.FileChangeType.Deleted) {
						dir.fileTypes.set(name, undefined);
						dir.fileTexts.delete(name);
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
			root.fileTexts.clear();
			root.fileTypes.clear();
			root.searched = false;
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
			if (currentCwd !== rootPath) {
				process.chdir(rootPath);
				currentCwd = rootPath;
			}
			return path.resolve(fsPath);
		}

		function fileExists(fsPath: path.OsPath): boolean {
			fsPath = resolvePath(fsPath);
			if (shouldPrefetch(env.fileNameToUri(fsPath))) {
				return !!readFile(fsPath);
			}
			const dir = getDir(path.dirname(fsPath));
			const name = path.basename(fsPath);
			if (dir.fileTypes.has(name)) {
				return dir.fileTypes.get(name) === FileType.File || dir.fileTypes.get(name) === FileType.SymbolicLink;
			}
			dir.fileTypes.set(name, undefined);
			if (connection) {
				statAsync(connection, fsPath);
			}
			else {
				onReadyCb.push((connection) => statAsync(connection, fsPath));
			}
			return false;
		}

		function readFile(fsPath: path.OsPath) {
			fsPath = resolvePath(fsPath);
			const dir = getDir(path.dirname(fsPath));
			const name = path.basename(fsPath);
			if (dir.fileTexts.has(name)) {
				return dir.fileTexts.get(name);
			}
			dir.fileTexts.set(name, '');
			if (connection) {
				fetch('load', fsPath, readFileAsync(connection, fsPath, dir));
			}
			else {
				onReadyCb.push((connection) => fetch('load', fsPath, readFileAsync(connection, fsPath, dir)));
			}
			return '';
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
				_dirPath => {

					let dirPath = _dirPath as path.OsPath;

					dirPath = resolvePath(dirPath);
					const dir = getDir(dirPath);
					const files = [...dir.fileTypes];

					if (!dir.searched) {
						dir.searched = true;
						if (connection) {
							fetch('directory', dirPath, readDirectoryAsync(connection, dirPath, dir));
						}
						else {
							onReadyCb.push((connection) => fetch('directory', dirPath, readDirectoryAsync(connection, dirPath, dir)));
						}
					}

					return {
						files: files.filter(file => file[1] === FileType.File).map(file => file[0]),
						directories: files.filter(file => file[1] === FileType.Directory).map(file => file[0]),
					};
				},
				path => path, // TODO
			);
		}

		// for import path completion
		function getDirectories(fsPath: path.OsPath) {

			fsPath = resolvePath(fsPath);

			const dir = getDir(fsPath);
			const files = [...dir.fileTypes];

			if (!dir.searched) {
				dir.searched = true;
				if (connection) {
					fetch('directory', fsPath, readDirectoryAsync(connection, fsPath, dir));
				}
				else {
					onReadyCb.push((connection) => fetch('directory', fsPath, readDirectoryAsync(connection, fsPath, dir)));
				}
			}

			return files.filter(file => file[1] === FileType.Directory).map(file => file[0]);
		}

		async function statAsync(connection: vscode.Connection, fsPath: path.OsPath) {
			const uri = env.fileNameToUri(fsPath);
			if (shouldSkip(uri)) {
				return;
			}
			statRequests.push(uri);

			if (!runningStat) {

				runningStat = true;
				const progress = await connection?.window.createWorkDoneProgress();
				progress?.begin('');
				while (statRequests.length) {
					const requests = [...statRequests];
					await shared.sleep(0);
					if (requests.length !== statRequests.length) {
						continue;
					}
					statRequests.length = 0;
					progress?.report(`stat ${requests.length} files`);
					const result = await connection.sendRequest(FsStatRequest.type, requests.map(resolveUrl));
					for (let i = 0; i < requests.length; i++) {
						const uri = requests[i];
						const stat = result[i];
						if (stat?.type === FileType.File || stat?.type === FileType.SymbolicLink) {
							updateStat(uri, stat);
						}
					}
				}
				progress.done();
				runningStat = false;

				fireChanges();
			}
		}

		function updateStat(uri: string, stat: FileStat) {
			const fsPath = env.uriToFileName(uri) as path.PosixPath;
			const name = path.basename(fsPath);
			const dir = getDir(path.dirname(fsPath));
			dir.fileTypes.set(name, stat.type);
			changes.push({
				uri: uri,
				type: vscode.FileChangeType.Created,
			});
		}

		async function readFileAsync(connection: vscode.Connection, fsPath: path.OsPath, dir: Dir) {
			const uri = env.fileNameToUri(fsPath);
			if (shouldSkip(uri)) {
				return;
			}
			const data = await connection.sendRequest(FsReadFileRequest.type, resolveUrl(uri));
			if (data) {
				const text = new TextDecoder('utf8').decode(data);
				const name = path.basename(fsPath);
				dir.fileTexts.set(name, text);
				changes.push({
					uri: uri,
					type: vscode.FileChangeType.Changed,
				});
			}
		}

		function shouldSkip(uri: string) {
			// ignore .js because it's no help for intellisense
			return (uri.startsWith('https://') || uri.startsWith('http://'))
				&& !(uri.endsWith('.d.ts') || uri.endsWith('/package.json'));
		}

		function shouldPrefetch(uri: string) {
			// ignore .js because it's no help for intellisense
			return (uri.startsWith('https://') || uri.startsWith('http://'))
				&& (uri.endsWith('.d.ts') || uri.endsWith('/package.json'));
		}

		async function readDirectoryAsync(connection: vscode.Connection, fsPath: path.OsPath, dir: Dir) {
			const uri = env.fileNameToUri(fsPath);
			const result = await connection.sendRequest(FsReadDirectoryRequest.type, resolveUrl(uri));
			for (const [name, fileType] of result) {
				if (dir.fileTypes.get(name) !== fileType && (fileType === FileType.File || fileType === FileType.SymbolicLink)) {
					changes.push({
						uri: env.fileNameToUri(path.join(fsPath, name as path.OsPath)),
						type: vscode.FileChangeType.Created,
					});
				}
				dir.fileTypes.set(name, fileType);
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

	function resolveUrl(uri: string) {
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
				fileTexts: new Map(),
				fileTypes: new Map(),
				searched: false,
			};
			dir.dirs.set(name, target);
		}
		return target;
	}
}
