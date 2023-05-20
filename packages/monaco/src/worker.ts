import {
	createLanguageService as _createLanguageService,
	type Config,
	type LanguageServiceHost
} from '@volar/language-service';
import type * as monaco from 'monaco-editor-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';

export function createLanguageService(options: {
	workerContext: monaco.worker.IWorkerContext<any>,
	dtsHost?: DtsHost,
	config: Config,
	typescript?: {
		module: typeof import('typescript/lib/tsserverlibrary'),
		compilerOptions: ts.CompilerOptions,
	},
}) {

	let dtsFilesNum = 0;
	let dtsFilesNumUpdateAt = 0;

	const ts = options.typescript?.module;
	const dtsFiles = new Map<string, string | undefined | Promise<void>>();
	const config = options.config ?? {};
	const compilerOptions = options.typescript?.compilerOptions ?? {};
	const host = createLanguageServiceHost();
	const languageService = _createLanguageService(
		{ typescript: ts },
		{
			uriToFileName: uri => URI.parse(uri).fsPath.replace(/\\/g, '/'),
			fileNameToUri: fileName => URI.file(fileName).toString(),
			rootUri: URI.file('/'),
		},
		config,
		host,
	);

	class InnocentRabbit { };

	for (const api in languageService) {

		const isFunction = typeof (languageService as any)[api] === 'function';;
		if (!isFunction) {
			(InnocentRabbit.prototype as any)[api] = () => (languageService as any)[api];
			continue;
		}

		(InnocentRabbit.prototype as any)[api] = async (...args: any[]) => {

			if (!options.dtsHost) {
				return (languageService as any)[api](...args);
			}

			let beforeDtsFilesNum = dtsFilesNum;
			let result = await (languageService as any)[api](...args);
			dtsFilesNum = (await getDtsFileNames()).length;

			while (beforeDtsFilesNum !== dtsFilesNum) {
				beforeDtsFilesNum = dtsFilesNum;
				result = await (languageService as any)[api](...args);
				dtsFilesNum = (await getDtsFileNames()).length;
			}

			return result;
		};
	}

	return new InnocentRabbit();

	function createLanguageServiceHost() {

		let projectVersion = 0;

		const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
		const dtsFileSnapshot = new Map<string, ts.IScriptSnapshot>();
		const modelVersions = new Map<monaco.worker.IMirrorModel, number>();
		const host: LanguageServiceHost = {
			getProjectVersion() {
				const models = options.workerContext.getMirrorModels();
				if (modelVersions.size === options.workerContext.getMirrorModels().length) {
					if (models.every(model => modelVersions.get(model) === model.version)) {
						return dtsFilesNum.toString() + ':' + projectVersion.toString();
					}
				}
				modelVersions.clear();
				for (const model of options.workerContext.getMirrorModels()) {
					modelVersions.set(model, model.version);
				}
				projectVersion++;
				return dtsFilesNum.toString() + ':' + projectVersion.toString();
			},
			getTypeRootsVersion() {
				return dtsFilesNum;
			},
			getScriptFileNames() {
				const models = options.workerContext.getMirrorModels();
				return models.map(model => model.uri.fsPath);
			},
			getScriptVersion(fileName) {
				const model = options.workerContext.getMirrorModels().find(model => model.uri.fsPath === fileName);
				if (model) {
					return model.version.toString();
				}
				return readDtsFile(fileName)?.length.toString() ?? '';
			},
			getScriptSnapshot(fileName) {
				const model = options.workerContext.getMirrorModels().find(model => model.uri.fsPath === fileName);
				if (model) {
					const cache = modelSnapshot.get(model);
					if (cache && cache[0] === model.version) {
						return cache[1];
					}
					const text = model.getValue();
					modelSnapshot.set(model, [model.version, {
						getText: (start, end) => text.substring(start, end),
						getLength: () => text.length,
						getChangeRange: () => undefined,
					}]);
					return modelSnapshot.get(model)?.[1];
				}
				if (dtsFileSnapshot.has(fileName)) {
					return dtsFileSnapshot.get(fileName);
				}
				const dtsFileText = readDtsFile(fileName);
				if (dtsFileText !== undefined) {
					dtsFileSnapshot.set(fileName, {
						getText: (start, end) => dtsFileText.substring(start, end),
						getLength: () => dtsFileText.length,
						getChangeRange: () => undefined,
					});
					return dtsFileSnapshot.get(fileName);
				}
			},
			getCompilationSettings() {
				return compilerOptions;
			},
			getCurrentDirectory() {
				return '/';
			},
			getDefaultLibFileName(options) {
				if (ts) {
					return `/node_modules/typescript/lib/${ts.getDefaultLibFileName(options)}`;
				}
				return '';
			},
			readFile(fileName) {
				const model = options.workerContext.getMirrorModels().find(model => model.uri.fsPath === fileName);
				if (model) {
					return model.getValue();
				}
				return readDtsFile(fileName);
			},
			fileExists(fileName) {
				const model = options.workerContext.getMirrorModels().find(model => model.uri.fsPath === fileName);
				if (model) {
					return true;
				}
				return readDtsFile(fileName) !== undefined;
			},
		};

		return host;
	}

	function readDtsFile(fileName: string) {
		if (!dtsFiles.has(fileName) && options.dtsHost) {
			dtsFiles.set(fileName, readDtsFileAsync(fileName));
		}
		const textOrFetching = dtsFiles.get(fileName);
		if (typeof textOrFetching === 'string') {
			return textOrFetching;
		}
	}

	async function readDtsFileAsync(fileName: string) {

		const pkgName = getPackageNameByNodeModulesPath(fileName);

		if (!fileName.startsWith('/node_modules/')) {
			return undefined;
		}
		if (pkgName.endsWith('.d.ts') || pkgName.endsWith('/node_modules')) {
			return undefined;
		}
		// hard code for known invalid package
		if (pkgName.startsWith('@typescript/') || pkgName.startsWith('@types/typescript__')) {
			return undefined;
		}
		// don't check @types if original package already having types
		if (pkgName.startsWith('@types/')) {
			let originalPkgName = pkgName.slice('@types/'.length);
			if (originalPkgName.indexOf('__') >= 0) {
				originalPkgName = '@' + originalPkgName.replace('__', '/');
			}
			const packageJson = await readDtsFileAsync(`/node_modules/${originalPkgName}/package.json`);
			if (packageJson) {
				const packageJsonObj = JSON.parse(packageJson);
				if (packageJsonObj.types || packageJsonObj.typings) {
					return undefined;
				}
				const indexDts = await readDtsFileAsync(`/node_modules/${originalPkgName}/index.d.ts`);
				if (indexDts) {
					return undefined;
				}
			}
		}

		const text = await options.dtsHost?.readFile(fileName);
		dtsFiles.set(fileName, text);
	}

	async function getDtsFileNames() {
		while (dtsFiles.size !== dtsFilesNumUpdateAt) {
			const newFileSize = dtsFiles.size;
			await Promise.all([...dtsFiles.values()]);
			if (newFileSize > dtsFilesNumUpdateAt) {
				dtsFilesNumUpdateAt = newFileSize;
			}
		}
		return [...dtsFiles.entries()].filter(([_, text]) => typeof text === 'string').map(([fileName]) => fileName);
	}
}

export function createBaseDtsHost(
	cdn: string,
	versions: Record<string, string> = {},
	flat?: (pkg: string, version: string | undefined) => Promise<string[]>,
	onFetch?: (fileName: string, text: string) => void,
) {
	return new CdnDtsHost(cdn, versions, flat, onFetch);
}

export function createJsDelivrDtsHost(
	versions: Record<string, string> = {},
	onFetch?: (fileName: string, text: string) => void,
) {
	return new CdnDtsHost(
		'https://cdn.jsdelivr.net/npm/',
		versions,
		async (pkg, version) => {

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
		onFetch,
	);
}

export interface DtsHost {
	readFile(fileName: string): Thenable<string | undefined>;
}

class CdnDtsHost implements DtsHost {

	files = new Map<string, Promise<string | undefined>>();
	flatResult = new Map<string, Promise<string[]>>();

	constructor(
		private cdn: string,
		private versions: Record<string, string> = {},
		private flat?: (pkg: string, version: string | undefined) => Promise<string[]>,
		private onFetch?: (fileName: string, text: string) => void,
	) { }

	async readFile(fileName: string) {
		if (!this.files.has(fileName)) {
			this.files.set(fileName, this.fetchFile(fileName));
		}
		return await this.files.get(fileName);
	}

	async fetchFile(fileName: string) {

		if (this.flat) {
			const pkgName = getPackageNameByNodeModulesPath(fileName);
			if (!this.flatResult.has(pkgName)) {
				this.flatResult.set(pkgName, this.flat(pkgName, this.versions[pkgName]));
			}
			const flat = await this.flatResult.get(pkgName)!;
			const include = flat.includes(fileName.slice(`/node_modules/${pkgName}`.length));
			if (!include) {
				return undefined;
			}
		}

		const requestFileName = this.resolveRequestFileName(fileName);
		const url = this.cdn + requestFileName.slice('/node_modules/'.length);
		const text = await fetchText(url);
		if (text !== undefined) {
			this.onFetch?.(fileName, text);
		}

		return text;
	}

	resolveRequestFileName(fileName: string) {
		for (const [key, version] of Object.entries(this.versions)) {
			if (fileName.startsWith(`/node_modules/${key}/`)) {
				fileName = fileName.replace(`/node_modules/${key}/`, `/node_modules/${key}@${version}/`);
				return fileName;
			}
		}
		return fileName;
	}
}

function getPackageNameByNodeModulesPath(nodeModulesPath: string) {
	let pkgName = nodeModulesPath.split('/')[2];
	if (pkgName.startsWith('@')) {
		pkgName += '/' + nodeModulesPath.split('/')[3];
	}
	return pkgName;
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
