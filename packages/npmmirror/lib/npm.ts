import type { FileStat, FileSystem, FileType } from "@volar/language-service";
import type { URI } from "vscode-uri";

const textCache = new Map<string, Promise<string | undefined>>();
const jsonCache = new Map<string, Promise<any>>();

export function createNpmFileSystem(
	getCdnPath = (uri: URI): string | undefined => {
		if (uri.path === "/node_modules") {
			return "";
		} else if (uri.path.startsWith("/node_modules/")) {
			return uri.path.slice("/node_modules/".length);
		}
	},
	getPackageVersion?: (pkgName: string) => string | undefined,
	onFetch?: (path: string, content: string) => void
): FileSystem {
	const fetchResults = new Map<string, Promise<string | undefined>>();
	const statCache = new Map<string, { type: FileType; }>();
	const dirCache = new Map<string, [string, FileType][]>();

	return {
		async stat(uri) {
			const path = getCdnPath(uri);
			if (path === undefined) {
				return;
			}
			if (path === "") {
				return {
					type: 2 satisfies FileType.Directory,
					size: -1,
					ctime: -1,
					mtime: -1,
				};
			}
			return await _stat(path);
		},
		async readFile(uri) {
			const path = getCdnPath(uri);
			if (path === undefined) {
				return;
			}
			return await _readFile(path);
		},
		readDirectory(uri) {
			const path = getCdnPath(uri);
			if (path === undefined) {
				return [];
			}
			return _readDirectory(path);
		},
	};

	async function _stat(path: string) {
		if (statCache.has(path)) {
			return {
				...statCache.get(path),
				ctime: -1,
				mtime: -1,
				size: -1,
			} as FileStat;
		}

		const [modName, pkgName, , pkgFilePath] = resolvePackageName(path);
		if (!pkgName) {
			if (modName.startsWith("@")) {
				return {
					type: 2 satisfies FileType.Directory,
					ctime: -1,
					mtime: -1,
					size: -1,
				};
			} else {
				return;
			}
		}
		if (!(await isValidPackageName(pkgName))) {
			return;
		}

		if (!pkgFilePath || pkgFilePath === "/") {
			const result = {
				type: 2 as FileType.Directory,
			};
			statCache.set(path, result);
			return { ...result, ctime: -1, mtime: -1, size: -1 };
		}

		try {
			const parentDir = path.substring(0, path.lastIndexOf("/"));
			const fileName = path.substring(path.lastIndexOf("/") + 1);

			const dirContent = await _readDirectory(parentDir);
			const fileEntry = dirContent.find(([name]) => name === fileName);

			if (fileEntry) {
				const result = {
					type: fileEntry[1],
				};
				statCache.set(path, result);
				return { ...result, ctime: -1, mtime: -1, size: -1 };
			}

			return;
		} catch {
			return;
		}
	}

	async function _readDirectory(path: string): Promise<[string, FileType][]> {
		if (dirCache.has(path)) {
			return dirCache.get(path)!;
		}

		const [, pkgName, pkgVersion, pkgPath] = resolvePackageName(path);

		if (!pkgName || !(await isValidPackageName(pkgName))) {
			return [];
		}

		const resolvedVersion = pkgVersion || "latest";

		let actualVersion = resolvedVersion;
		if (resolvedVersion === "latest") {
			try {
				const data = await fetchJson<{ version: string; }>(
					`https://registry.npmmirror.com/${pkgName}/latest/files/package.json`
				);
				if (data?.version) {
					actualVersion = data.version;
				}
			} catch {
				// ignore
			}
		}

		const endpoint = `https://registry.npmmirror.com/${pkgName}/${actualVersion}/files/${pkgPath}/?meta`;
		try {
			const data = await fetchJson<{
				files: {
					path: string;
					type: "file" | "directory";
					size?: number;
				}[];
			}>(endpoint);

			if (!data?.files) {
				return [];
			}

			const result: [string, FileType][] = data.files.map((file) => {
				const type =
					file.type === "directory"
						? (2 as FileType.Directory)
						: (1 as FileType.File);

				const fullPath = file.path;
				statCache.set(fullPath, { type });

				return [_getNameFromPath(file.path), type];
			});

			dirCache.set(path, result);
			return result;
		} catch {
			return [];
		}
	}

	function _getNameFromPath(path: string): string {
		if (!path) return "";

		const trimmedPath = path.endsWith("/") ? path.slice(0, -1) : path;

		const lastSlashIndex = trimmedPath.lastIndexOf("/");

		if (
			lastSlashIndex === -1 ||
			(lastSlashIndex === 0 && trimmedPath.length === 1)
		) {
			return trimmedPath;
		}

		return trimmedPath.slice(lastSlashIndex + 1);
	}

	async function _readFile(path: string): Promise<string | undefined> {
		const [_modName, pkgName, _version, pkgFilePath] = resolvePackageName(path);
		if (!pkgName || !pkgFilePath || !(await isValidPackageName(pkgName))) {
			return;
		}

		if (!fetchResults.has(path)) {
			fetchResults.set(
				path,
				(async () => {
					if ((await _stat(path))?.type !== (1 satisfies FileType.File)) {
						return;
					}
					const text = await fetchText(
						`https://registry.npmmirror.com/${pkgName}/${_version || "latest"
						}/files/${pkgFilePath}`
					);
					if (text !== undefined) {
						onFetch?.(path, text);
					}
					return text;
				})()
			);
		}

		return await fetchResults.get(path)!;
	}

	async function isValidPackageName(pkgName: string) {
		// ignore @aaa/node_modules
		if (pkgName.endsWith("/node_modules")) {
			return false;
		}
		// hard code to skip known invalid package
		if (
			pkgName.endsWith(".d.ts") ||
			pkgName.startsWith("@typescript/") ||
			pkgName.startsWith("@types/typescript__")
		) {
			return false;
		}
		// don't check @types if original package already having types
		if (pkgName.startsWith("@types/")) {
			let originalPkgName = pkgName.slice("@types/".length);
			if (originalPkgName.indexOf("__") >= 0) {
				originalPkgName = "@" + originalPkgName.replace("__", "/");
			}
			const packageJson = await _readFile(`${originalPkgName}/package.json`);
			if (!packageJson) {
				return false;
			}
			const packageJsonObj = JSON.parse(packageJson);
			if (packageJsonObj.types || packageJsonObj.typings) {
				return false;
			}
			const indexDts = await _stat(`${originalPkgName}/index.d.ts`);
			if (indexDts?.type === (1 satisfies FileType.File)) {
				return false;
			}
		}
		return true;
	}

	/**
	 * @example
	 * "a/b/c" -> ["a", "a", undefined, "b/c"]
	 * "@a" -> ["@a", undefined, undefined, ""]
	 * "@a/b/c" -> ["@a/b", "@a/b", undefined, "c"]
	 * "@a/b@1.2.3/c" -> ["@a/b@1.2.3", "@a/b", "1.2.3", "c"]
	 */
	function resolvePackageName(
		input: string
	): [
			modName: string,
			pkgName: string | undefined,
			version: string | undefined,
			path: string
		] {
		const parts = input.split("/");
		let modName = parts[0];
		let path: string;
		if (modName.startsWith("@")) {
			if (!parts[1]) {
				return [modName, undefined, undefined, ""];
			}
			modName += "/" + parts[1];
			path = parts.slice(2).join("/");
		} else {
			path = parts.slice(1).join("/");
		}
		let pkgName = modName;
		let version: string | undefined;
		if (modName.lastIndexOf("@") >= 1) {
			pkgName = modName.substring(0, modName.lastIndexOf("@"));
			version = modName.substring(modName.lastIndexOf("@") + 1);
		}
		if (!version && getPackageVersion) {
			version = getPackageVersion?.(pkgName);
		}
		return [modName, pkgName, version, path];
	}
}

async function fetchText(url: string) {
	if (!textCache.has(url)) {
		textCache.set(
			url,
			(async () => {
				try {
					const res = await fetch(url);
					if (res.status === 200) {
						return await res.text();
					}
				} catch {
					// ignore
				}
			})()
		);
	}
	return await textCache.get(url)!;
}

async function fetchJson<T>(url: string) {
	if (!jsonCache.has(url)) {
		jsonCache.set(
			url,
			(async () => {
				try {
					const res = await fetch(url);
					if (res.status === 200) {
						return await res.json();
					}
				} catch {
					// ignore
				}
			})()
		);
	}
	return (await jsonCache.get(url)!) as T;
}
