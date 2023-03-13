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
	dtsHost?: ReturnType<typeof createDtsHost>,
	config: Config,
	typescript?: {
		module: typeof import('typescript/lib/tsserverlibrary'),
		compilerOptions: ts.CompilerOptions,
	},
}) {

	const dtsFiles = new Map<string, string | undefined>();
	const ts: typeof import('typescript/lib/tsserverlibrary') | undefined = options.typescript ? options.typescript.module : undefined;
	const config = options.config ?? {};
	const compilerOptions = options.typescript?.compilerOptions ?? {};
	let host = createLanguageServiceHost();
	let languageService = _createLanguageService({
		host,
		config,
		uriToFileName: (uri: string) => URI.parse(uri).fsPath.replace(/\\/g, '/'),
		fileNameToUri: (fileName: string) => URI.file(fileName).toString(),
		rootUri: URI.file('/'),
	});
	let dtsVersion = 0;

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

			let oldVersion = await options.dtsHost.getVersion();
			let result = await (languageService as any)[api](...args);
			let newVersion = await options.dtsHost.getVersion();

			while (newVersion !== oldVersion) {
				oldVersion = newVersion;
				if (newVersion !== dtsVersion) {
					dtsVersion = newVersion;
					languageService.dispose();
					languageService = _createLanguageService({
						host,
						config,
						rootUri: URI.file('/'),
						uriToFileName: (uri: string) => URI.parse(uri).fsPath.replace(/\\/g, '/'),
						fileNameToUri: (fileName: string) => URI.file(fileName).toString(),
					});
				}
				result = await (languageService as any)[api](...args);
				newVersion = await options.dtsHost.getVersion();
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
						return projectVersion.toString();
					}
				}
				modelVersions.clear();
				for (const model of options.workerContext.getMirrorModels()) {
					modelVersions.set(model, model.version);
				}
				projectVersion++;
				return projectVersion.toString();
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
				const dts = readDtsFile(fileName);
				if (dts) {
					return dts.length.toString();
				}
				return '';
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
					return `/node_modules/typescript@${ts.version}/lib/${ts.getDefaultLibFileName(options)}`;
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
			getTypeScriptModule: ts ? (() => ts) : undefined,
		};

		return host;
	}

	function readDtsFile(fileName: string) {
		if (!dtsFiles.has(fileName) && options.dtsHost) {
			dtsFiles.set(fileName, undefined);
			readDtsFileAsync(fileName);
		}
		return dtsFiles.get(fileName);
	}

	async function readDtsFileAsync(fileName: string) {
		const text = await options.dtsHost?.readFile(fileName);
		dtsFiles.set(fileName, text);
	}
}

export function createDtsHost(
	cdn: string,
	versions: Record<string, string> = {},
	onFetch?: (fileName: string, text: string) => void,
) {
	return new CdnDtsHost(cdn, versions, onFetch);
}

class CdnDtsHost {

	files = new Map<string, Promise<string | undefined> | string | undefined>();
	lastUpdateFilesSize = 0;

	constructor(
		public cdn: string,
		public versions: Record<string, string> = {},
		public onFetch?: (fileName: string, text: string) => void,
	) { }

	async getVersion() {
		while (this.files.size !== this.lastUpdateFilesSize) {
			this.lastUpdateFilesSize = this.files.size;
			await Promise.all(this.files.values());
		}
		return this.files.size;
	}

	readFile(fileName: string) {
		if (
			fileName.startsWith('/node_modules/')
			// ignore .js because it's no help for intellisense
			&& (fileName.endsWith('.d.ts') || fileName.endsWith('/package.json'))
		) {
			if (!this.files.has(fileName)) {
				this.files.set(fileName, undefined);
				this.files.set(fileName, this.fetchFile(fileName));
			}
			return this.files.get(fileName);
		}
		return undefined;
	}

	async fetchFile(fileName: string) {
		const requestFileName = this.resolveRequestFileName(fileName);
		const url = this.cdn + requestFileName.slice('/node_modules/'.length);
		try {
			const text = await (await fetch(url)).text();
			this.onFetch?.(fileName, text);
			return text;
		} catch {
			// ignore
		}
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

	/**
	 * save / load with json
	 */

	async toJson() {
		const json: Record<string, string | null> = {};
		for (const [fileName, file] of this.files) {
			json[fileName] = (await file) ?? null;
		}
		return json;
	}

	fromJson(json: Record<string, string | null>) {
		for (const [fileName, file] of Object.entries(json)) {
			this.files.set(fileName, file ?? undefined);
		}
	}
}
