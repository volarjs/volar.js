import { getPackageNameOfDtsPath } from "./utils";

export interface IDtsHost {
	readFile(fileName: string): Promise<string | undefined>;
	fileExists(fileName: string): Promise<boolean>;
}

export function createJsDelivrDtsHost(
	versions: Record<string, string> = {},
	onFetch?: (fileName: string, text: string) => void,
) {
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

			const flat = await fetchJson<{ files: { name: string }[]; }>(`https://data.jsdelivr.com/v1/package/npm/${pkg}@${version}/flat`);
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

	async readFile(fileName: string) {
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

		if (!await this.fileExists(fileName)) {
			return undefined;
		}

		return await this.fetchText(fileName);
	}

	async fileExists(fileName: string) {

		const pkgName = getPackageNameOfDtsPath(fileName);
		if (!pkgName) {
			return false;
		}

		if (!this.flatResults.has(pkgName)) {
			this.flatResults.set(pkgName, this.flat(pkgName));
		}

		const flat = await this.flatResults.get(pkgName)!;
		return flat.includes(fileName.slice(`/node_modules/${pkgName}`.length));
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
