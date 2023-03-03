import {
	createLanguageService as _createLanguageService,
	type Config,
	type LanguageServiceHost
} from '@volar/language-service';
import type * as monaco from 'monaco-editor-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';
import axios from 'axios';

export function createLanguageService(options: {
	workerContext: monaco.worker.IWorkerContext<any>,
	dtsHost?: ReturnType<typeof createDtsHost>,
	config: Config,
	typescript?: {
		module: typeof import('typescript/lib/tsserverlibrary'),
		compilerOptions: ts.CompilerOptions,
	},
}) {

	const dtsClient = options.dtsHost ? createDtsClient(options.dtsHost) : undefined;
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

			if (!dtsClient) {
				return (languageService as any)[api](...args);
			}

			let oldVersion = await dtsClient.getVersion();
			let result = await (languageService as any)[api](...args);
			let newVersion = await dtsClient.getVersion();

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
				newVersion = await dtsClient.getVersion();
			}

			return result;
		};
	}

	return new InnocentRabbit();

	function createLanguageServiceHost() {

		let projectVersion = 0;

		const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
		const webFileSnapshot = new Map<string, ts.IScriptSnapshot>();
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
				if (dtsClient) {
					const dts = dtsClient.readFile(fileName);
					if (dts) {
						return dts.length.toString();
					}
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
				if (webFileSnapshot.has(fileName)) {
					return webFileSnapshot.get(fileName);
				}
				if (dtsClient) {
					const webFileText = dtsClient.readFile(fileName);
					if (webFileText !== undefined) {
						webFileSnapshot.set(fileName, {
							getText: (start, end) => webFileText.substring(start, end),
							getLength: () => webFileText.length,
							getChangeRange: () => undefined,
						});
						return webFileSnapshot.get(fileName);
					}
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
				if (dtsClient) {
					return dtsClient.readFile(fileName);
				}
			},
			fileExists(fileName) {
				const model = options.workerContext.getMirrorModels().find(model => model.uri.fsPath === fileName);
				if (model) {
					return true;
				}
				if (dtsClient) {
					return dtsClient.readFile(fileName) !== undefined;
				}
				return false;
			},
			getTypeScriptModule: ts ? (() => ts) : undefined,
		};

		return host;
	}
}

export function createDtsHost(cdn: string, onFetch?: (fileName: string, text: string) => void) {
	return new CdnDtsHost(cdn, onFetch);
}

class CdnDtsHost {

	files = new Map<string, Promise<string | undefined> | string | undefined>();
	lastUpdateFilesSize = 0;

	constructor(
		private cdn: string,
		private onFetch?: (fileName: string, text: string) => void,
	) { }

	async getVersion() {
		while (this.files.size !== this.lastUpdateFilesSize) {
			this.lastUpdateFilesSize = this.files.size;
			await Promise.all(this.files.values());
		}
		return this.files.size;
	}

	readFile(fileName: string) {
		if (!this.files.has(fileName)) {
			this.files.set(fileName, undefined);
			if (
				fileName.startsWith('/node_modules/')
				// ignore .js because it's no help for intellisense
				&& (fileName.endsWith('.d.ts') || fileName.endsWith('/package.json'))
			) {
				const url = this.cdn + fileName.slice('/node_modules/'.length);
				this.files.set(fileName, this.fetch(fileName, url));
			}
		}
		return this.files.get(fileName)!;
	}

	async fetch(fileName: string, url: string) {
		try {
			const text = (await axios.get(url, {
				transformResponse: (res) => {
					// avoid parse to json object
					return res;
				},
			})).data as string ?? undefined;
			this.onFetch?.(fileName, text);
			return text;
		} catch {
			// ignore
		}
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

function createDtsClient(server: ReturnType<typeof createDtsHost>) {

	const fetchTasks: [string, Promise<void>][] = [];
	const files = new Map<string, string | undefined>();

	return {
		readFile,
		getVersion: () => server.getVersion(),
		readFileAsync,
	};

	function readFile(fileName: string) {
		if (!files.has(fileName)) {
			files.set(fileName, undefined);
			fetchTasks.push([fileName, readFileAsync(fileName)]);
		}
		return files.get(fileName);
	}

	async function readFileAsync(fileName: string) {
		const text = await server.readFile(fileName);
		files.set(fileName, text);
	}
}
