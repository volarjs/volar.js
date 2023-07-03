import type { FileType, FileSystem, FileStat, Result } from '@volar/language-service';
import { UriResolver } from '../types';
import { fetchJson, fetchText } from '../utils';

export function createGitHubUriResolver(owner: string, repo: string, branch: string, fileNameBase = '/workspace'): UriResolver {

	const gitHubUriBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;

	return {
		uriToFileName,
		fileNameToUri,
	};

	function uriToFileName(uri: string) {
		if (uri === gitHubUriBase) {
			return fileNameBase;
		}
		if (uri.startsWith(gitHubUriBase + '/')) {
			const path = uri.substring(gitHubUriBase.length);
			return `${fileNameBase}${path}`;
		}
	}

	function fileNameToUri(fileName: string) {
		if (fileName === fileNameBase) {
			return gitHubUriBase;
		}
		if (fileName.startsWith(fileNameBase + '/')) {
			const path = fileName.substring(fileNameBase.length);
			return `${gitHubUriBase}${path}`;
		}
	}
}

export function createGitHubFs(owner: string, repo: string, branch: string, onReadFile?: (uri: string, content: string) => void): FileSystem {

	const gitHubUriBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;

	return {
		stat,
		readDirectory,
		readFile,
	};

	function stat(uri: string): Result<FileStat | undefined> {

		if (uri === gitHubUriBase) {
			return {
				type: 2 satisfies FileType.Directory,
				size: -1,
				ctime: -1,
				mtime: -1,
			};
		}

		if (uri.startsWith(gitHubUriBase + '/')) {

			if (uri.endsWith('/')) {
				return {
					type: 2 satisfies FileType.Directory,
					size: -1,
					ctime: -1,
					mtime: -1,
				};
			}

			return (async () => {

				const path = uri.substring(gitHubUriBase.length);
				const dirName = path.substring(0, path.lastIndexOf('/'));
				const baseName = path.substring(path.lastIndexOf('/') + 1);
				const dirData = await fetchContents(dirName);
				const file = dirData.find(entry => entry.name === baseName && entry.type === 'file');
				const dir = dirData.find(entry => entry.name === baseName && entry.type === 'dir');
				if (file) {
					return {
						type: 1 satisfies FileType.File,
						size: file.size,
						ctime: -1,
						mtime: -1,
					};
				}
				if (dir) {
					return {
						type: 2 satisfies FileType.Directory,
						size: dir.size,
						ctime: -1,
						mtime: -1,
					};
				}
			})();
		}
	}

	function readDirectory(uri: string): Result<[string, FileType][]> {

		if (uri === gitHubUriBase || uri.startsWith(gitHubUriBase + '/')) {

			return (async () => {

				const path = uri.substring(gitHubUriBase.length);
				const dirData = await fetchContents(path);
				return dirData.map(entry => [
					entry.name,
					entry.type === 'file' ? 1 satisfies FileType.File
						: entry.type === 'dir' ? 2 satisfies FileType.Directory
							: 0 satisfies FileType.Unknown,
				]);
			})();
		}

		return [];
	}

	function readFile(uri: string): Result<string | undefined> {

		if (uri.startsWith(gitHubUriBase + '/')) {

			return (async () => {
				const text = await fetchText(uri);
				if (text !== undefined) {
					onReadFile?.(uri, text);
				}
				return text;
			})();
		}
	}

	async function fetchContents(dirName: string) {
		return await fetchJson<{
			name: string;
			path: string;
			sha: string;
			size: number;
			url: string;
			html_url: string;
			git_url: string;
			download_url: null | string;
			type: 'file' | 'dir',
		}[]>(`https://api.github.com/repos/${owner}/${repo}/contents${dirName}?ref=${branch}`) ?? [];
	}
}
