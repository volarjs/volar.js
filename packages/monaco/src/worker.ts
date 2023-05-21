import {
	createLanguageService as _createLanguageService,
	type Config,
	type LanguageServiceHost
} from '@volar/language-service';
import type * as monaco from 'monaco-editor-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';
import * as webFs from '@volar/web-fs';

export * from '@volar/web-fs';

export function createLanguageService(options: {
	workerContext: monaco.worker.IWorkerContext<any>,
	dtsHost?: webFs.IDtsHost,
	config: Config,
	typescript?: {
		module: typeof import('typescript/lib/tsserverlibrary'),
		compilerOptions: ts.CompilerOptions,
	},
}) {

	let dtsClientVersion = 0;

	const ts = options.typescript?.module;
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
	const dtsClient = options.dtsHost ? webFs.createDtsClient(options.dtsHost) : undefined;

	if (!dtsClient) {
		return languageService;
	}

	class InnocentRabbit { };

	for (const api in languageService) {

		const isFunction = typeof (languageService as any)[api] === 'function';
		if (!isFunction) {
			(InnocentRabbit.prototype as any)[api] = () => (languageService as any)[api];
			continue;
		}

		(InnocentRabbit.prototype as any)[api] = async (...args: any[]) => {

			if (!options.dtsHost) {
				return (languageService as any)[api](...args);
			}

			let lastDtsClientVersion = dtsClientVersion;
			let result = await (languageService as any)[api](...args);
			dtsClientVersion = await dtsClient.sync();

			while (lastDtsClientVersion !== dtsClientVersion) {
				lastDtsClientVersion = dtsClientVersion;
				result = await (languageService as any)[api](...args);
				dtsClientVersion = await dtsClient.sync();
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
						return dtsClientVersion.toString() + ':' + projectVersion.toString();
					}
				}
				modelVersions.clear();
				for (const model of options.workerContext.getMirrorModels()) {
					modelVersions.set(model, model.version);
				}
				projectVersion++;
				return dtsClientVersion.toString() + ':' + projectVersion.toString();
			},
			getTypeRootsVersion() {
				return dtsClientVersion;
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
				return dtsClient?.readFile(fileName)?.length.toString() ?? '';
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
				const dtsFileText = dtsClient?.readFile(fileName);
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
				return dtsClient?.readFile(fileName);
			},
			fileExists(fileName) {
				const model = options.workerContext.getMirrorModels().find(model => model.uri.fsPath === fileName);
				if (model) {
					return true;
				}
				return dtsClient?.fileExists(fileName) ?? false;
			},
		};

		return host;
	}
}
