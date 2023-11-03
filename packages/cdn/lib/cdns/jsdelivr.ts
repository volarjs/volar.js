import type { FileType, FileSystem, FileStat } from '@volar/language-service';
import { UriResolver } from '../types';
import { fetchJson, fetchText } from '../utils';

export const jsDelivrUriBase = 'https://cdn.jsdelivr.net/npm';

export function createJsDelivrUriResolver(
	fileNameBase: string,
	versions: Record<string, string> = {},
): UriResolver {

	return {
		uriToFileName,
		fileNameToUri,
	};

	function uriToFileName(uri: string) {
		if (uri === jsDelivrUriBase) {
			return fileNameBase;
		}
		if (uri.startsWith(jsDelivrUriBase + '/')) {
			const path = uri.substring(jsDelivrUriBase.length);
			const pkgName = getPackageName(path);
			if (pkgName?.substring(1).includes('@')) {
				const trimedVersion = pkgName.substring(0, pkgName.lastIndexOf('@'));
				return `${fileNameBase}${path.replace(pkgName, trimedVersion)}`;
			}
			return `${fileNameBase}${path}`;
		}
	}

	function fileNameToUri(fileName: string) {
		if (fileName === fileNameBase) {
			return jsDelivrUriBase;
		}
		if (fileName.startsWith(fileNameBase + '/')) {
			const path = fileName.substring(fileNameBase.length);
			const pkgName = getPackageName(path);
			if (pkgName) {
				const version = versions[pkgName] ?? 'latest';
				return `${jsDelivrUriBase}/${pkgName}@${version}${path.substring(1 + pkgName.length)}`;
			}
			return `${jsDelivrUriBase}${path}`;
		}
	}
}

export function createJsDelivrFs(onReadFile?: (uri: string, content: string) => void): FileSystem {

	const fetchResults = new Map<string, Promise<string | undefined>>();
	const flatResults = new Map<string, Promise<{
		name: string;
		size: number;
		time: string;
		hash: string;
	}[]>>();

	return {
		stat,
		readDirectory,
		readFile,
	};

	async function stat(uri: string): Promise<FileStat | undefined> {

		if (uri === jsDelivrUriBase) {
			return {
				type: 2 satisfies FileType.Directory,
				size: -1,
				ctime: -1,
				mtime: -1,
			};
		}

		if (uri.startsWith(jsDelivrUriBase + '/')) {

			const path = uri.substring(jsDelivrUriBase.length);
			const pkgName = getPackageName(path);
			if (!pkgName || !await isValidPackageName(pkgName)) {
				return;
			}

			if (!flatResults.has(pkgName)) {
				flatResults.set(pkgName, flat(pkgName));
			}

			const flatResult = await flatResults.get(pkgName)!;
			const filePath = path.slice(`/${pkgName}`.length);
			const file = flatResult.find(file => file.name === filePath);
			if (file) {
				return {
					type: 1 satisfies FileType.File,
					ctime: new Date(file.time).valueOf(),
					mtime: new Date(file.time).valueOf(),
					size: file.size,
				};
			}
			else if (flatResult.some(file => file.name.startsWith(filePath + '/'))) {
				return {
					type: 2 satisfies FileType.Directory,
					ctime: -1,
					mtime: -1,
					size: -1,
				};
			}
		}
	}

	async function readDirectory(uri: string): Promise<[string, FileType][]> {

		if (uri.startsWith(jsDelivrUriBase + '/')) {

			const path = uri.substring(jsDelivrUriBase.length);
			const pkgName = getPackageName(path);
			if (!pkgName || !await isValidPackageName(pkgName)) {
				return [];
			}

			if (!flatResults.has(pkgName)) {
				flatResults.set(pkgName, flat(pkgName));
			}

			const flatResult = await flatResults.get(pkgName)!;
			const dirPath = path.slice(`/${pkgName}`.length);
			const files = flatResult
				.filter(f => f.name.substring(0, f.name.lastIndexOf('/')) === dirPath)
				.map(f => f.name.slice(dirPath.length + 1));
			const dirs = flatResult
				.filter(f => f.name.startsWith(dirPath + '/') && f.name.substring(dirPath.length + 1).split('/').length >= 2)
				.map(f => f.name.slice(dirPath.length + 1).split('/')[0]);

			return [
				...files.map<[string, FileType]>(f => [f, 1 satisfies FileType.File]),
				...[...new Set(dirs)].map<[string, FileType]>(f => [f, 2 satisfies FileType.Directory]),
			];
		}

		return [];
	}

	async function readFile(uri: string): Promise<string | undefined> {

		if (uri.startsWith(jsDelivrUriBase + '/')) {

			const path = uri.substring(jsDelivrUriBase.length);
			const pkgName = getPackageName(path);
			if (!pkgName || !await isValidPackageName(pkgName)) {
				return;
			}

			if (!fetchResults.has(path)) {
				fetchResults.set(path, (async () => {
					if ((await stat(uri))?.type !== 1 satisfies FileType.File) {
						return;
					}
					const text = await fetchText(uri);
					if (text !== undefined) {
						onReadFile?.(uri, text);
					}
					return text;
				})());
			}

			return await fetchResults.get(path)!;
		}
	}

	async function flat(pkgNameWithVersion: string) {

		let pkgName = pkgNameWithVersion;
		let version = 'latest';

		if (pkgNameWithVersion.substring(1).includes('@')) {
			pkgName = pkgNameWithVersion.substring(0, pkgNameWithVersion.lastIndexOf('@'));
			version = pkgNameWithVersion.substring(pkgNameWithVersion.lastIndexOf('@') + 1);
		}

		// resolve tag version
		if (version === 'latest') {
			const data = await fetchJson<{ version: string | null; }>(`https://data.jsdelivr.com/v1/package/resolve/npm/${pkgName}@latest`);
			if (!data?.version) {
				return [];
			}
			version = data.version;
		}

		const flat = await fetchJson<{
			files: {
				name: string;
				size: number;
				time: string;
				hash: string;
			}[];
		}>(`https://data.jsdelivr.com/v1/package/npm/${pkgName}@${version}/flat`);
		if (!flat) {
			return [];
		}

		return flat.files;
	}

	async function isValidPackageName(pkgName: string) {
		if (pkgName.substring(1).includes('@')) {
			pkgName = pkgName.substring(0, pkgName.lastIndexOf('@'));
		}
		if (pkgName.indexOf('.') >= 0 || pkgName.endsWith('/node_modules')) {
			return false;
		}
		// hard code for known invalid package
		if (pkgName.startsWith('@typescript/') || pkgName.startsWith('@types/typescript__')) {
			return false;
		}
		// don't check @types if original package already having types
		if (pkgName.startsWith('@types/')) {
			let originalPkgName = pkgName.slice('@types/'.length);
			if (originalPkgName.indexOf('__') >= 0) {
				originalPkgName = '@' + originalPkgName.replace('__', '/');
			}
			const packageJson = await readFile(`${jsDelivrUriBase}/${originalPkgName}/package.json`);
			if (packageJson) {
				const packageJsonObj = JSON.parse(packageJson);
				if (packageJsonObj.types || packageJsonObj.typings) {
					return false;
				}
				const indexDts = await stat(`${jsDelivrUriBase}/${originalPkgName}/index.d.ts`);
				if (indexDts?.type === 1 satisfies FileType.File) {
					return false;
				}
			}
		}
		return true;
	}
}

/**
 * @example
 * "/a/b/c" -> "a"
 * "/@a/b/c" -> "@a/b"
 * "/@a/b@1.2.3/c" -> "@a/b@1.2.3"
 */
export function getPackageName(path: string) {
	const parts = path.split('/');
	let pkgName = parts[1];
	if (pkgName.startsWith('@')) {
		if (parts.length < 3 || !parts[2]) {
			return undefined;
		}
		pkgName += '/' + parts[2];
	}
	return pkgName;
}
