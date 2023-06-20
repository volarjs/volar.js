import type { FileStat, FileType } from '@volar/language-service';

export interface IDtsHost {
	stat(uri: string): Promise<FileStat | undefined>;
	readFile(fileName: string): Promise<string | undefined>;
	readDirectory(dirName: string): Promise<[string, FileType][]>;
}

export function createJsDelivrDtsHost(
	versions: Record<string, string> = {},
	onFetch?: (fileName: string, text: string) => void,
): IDtsHost {
	return new DtsHost(
		async fileName => {
			const requestFileName = resolveRequestFileName(fileName);
			const url = 'https://cdn.jsdelivr.net/npm/' + requestFileName.slice('/node_modules/'.length);
			const text = await fetchText(url);
			if (text !== undefined) {
				onFetch?.(fileName, text);
			}
			return text;
		},
		async (pkg) => {

			let version = versions[pkg];
			if (!version) {
				const data = await fetchJson<{ version: string | null; }>(`https://data.jsdelivr.com/v1/package/resolve/npm/${pkg}@latest`);
				if (data?.version) {
					version = data.version;
				}
			}
			if (!version) {
				return [];
			}

			const flat = await fetchJson<{ files: { name: string; }[]; }>(`https://data.jsdelivr.com/v1/package/npm/${pkg}@${version}/flat`);
			if (!flat) {
				return [];
			}

			return flat.files.map(file => file.name);
		},
	);

	function resolveRequestFileName(fileName: string) {
		for (const [key, version] of Object.entries(versions)) {
			if (fileName.startsWith(`/node_modules/${key}/`)) {
				fileName = fileName.replace(`/node_modules/${key}/`, `/node_modules/${key}@${version}/`);
				return fileName;
			}
		}
		return fileName;
	}
}

class DtsHost implements IDtsHost {

	fetchResults = new Map<string, Promise<string | undefined>>();
	flatResults = new Map<string, Promise<string[]>>();

	constructor(
		private fetchText: (path: string) => Promise<string | undefined>,
		private flat: (pkg: string) => Promise<string[]>,
	) { }

	async stat(fileName: string) {

		if (!await this.valid(fileName)) {
			return;
		}

		const pkgName = getPackageNameOfDtsPath(fileName);
		if (!pkgName) {
			return;
		}

		if (!this.flatResults.has(pkgName)) {
			this.flatResults.set(pkgName, this.flat(pkgName));
		}

		const flat = await this.flatResults.get(pkgName)!;
		const filePath = fileName.slice(`/node_modules/${pkgName}`.length);
		if (flat.includes(filePath)) {
			return {
				type: 1 satisfies FileType.File,
				ctime: -1,
				mtime: -1,
				size: -1,
			};
		}
		else if (flat.some(f => f.startsWith(filePath + '/'))) {
			return {
				type: 2 satisfies FileType.Directory,
				ctime: -1,
				mtime: -1,
				size: -1,
			};
		}
	}

	async readDirectory(dirName: string) {

		if (!await this.valid(dirName)) {
			return [];
		}

		const pkgName = getPackageNameOfDtsPath(dirName);
		if (!pkgName) {
			return [];
		}

		if (!this.flatResults.has(pkgName)) {
			this.flatResults.set(pkgName, this.flat(pkgName));
		}

		const flat = await this.flatResults.get(pkgName)!;
		const dirPath = dirName.slice(`/node_modules/${pkgName}`.length);
		const files = flat
			.filter(f => f.substring(0, f.lastIndexOf('/')) === dirPath)
			.map(f => f.slice(dirPath.length + 1));
		const dirs = flat
			.filter(f => f.startsWith(dirPath + '/') && f.substring(dirPath.length + 1).split('/').length >= 2)
			.map(f => f.slice(dirPath.length + 1).split('/')[0]);

		return [
			...files.map<[string, FileType]>(f => [f, 1 satisfies FileType.File]),
			...[...new Set(dirs)].map<[string, FileType]>(f => [f, 2 satisfies FileType.Directory]),
		];
	}

	async readFile(fileName: string) {

		if (!await this.valid(fileName)) {
			return;
		}

		if (!this.fetchResults.has(fileName)) {
			this.fetchResults.set(fileName, this.fetchFile(fileName));
		}
		return await this.fetchResults.get(fileName);
	}

	async fetchFile(fileName: string) {

		const pkgName = getPackageNameOfDtsPath(fileName);
		if (!pkgName) {
			return undefined;
		}

		if ((await this.stat(fileName))?.type !== 1 satisfies FileType.File) {
			return undefined;
		}

		return await this.fetchText(fileName);
	}

	async valid(fileName: string) {
		const pkgName = getPackageNameOfDtsPath(fileName);
		if (!pkgName) {
			return false;
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
			const packageJson = await this.readFile(`/node_modules/${originalPkgName}/package.json`);
			if (packageJson) {
				const packageJsonObj = JSON.parse(packageJson);
				if (packageJsonObj.types || packageJsonObj.typings) {
					return false;
				}
				const indexDts = await this.stat(`/node_modules/${originalPkgName}/index.d.ts`);
				if (indexDts?.type === 1 satisfies FileType.File) {
					return false;
				}
			}
		}
		return true;
	}
}

async function fetchText(url: string) {
	try {
		const res = await fetch(url);
		if (res.status === 200) {
			return await res.text();
		}
	} catch {
		// ignore
	}
}

async function fetchJson<T>(url: string) {
	try {
		const res = await fetch(url);
		if (res.status === 200) {
			return await res.json() as T;
		}
	} catch {
		// ignore
	}
}

export function getPackageNameOfDtsPath(path: string) {
	if (!path.startsWith('/node_modules/')) {
		return undefined;
	}
	let pkgName = path.split('/')[2];
	if (pkgName.startsWith('@')) {
		if (path.split('/').length < 4) {
			return undefined;
		}
		pkgName += '/' + path.split('/')[3];
	}
	return pkgName;
}
