import {
	createLanguageService as _createLanguageService,
	type Config,
	type LanguageServiceHost
} from '@volar/language-service';
import type * as monaco from 'monaco-editor-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';
import { createAutoTypesFetchingHost } from './utils/autoFetchTypes';

export function createLanguageService(options: {
	workerContext: monaco.worker.IWorkerContext<any>,
	config: Config,
	typescript?: {
		module: typeof import('typescript/lib/tsserverlibrary'),
		compilerOptions: ts.CompilerOptions,
		autoFetchTypes?: boolean | {
			onFetchTypesFiles?(files: Record<string, string>): void,
			cdn?: string,
		},
	},
}) {

	const ts: typeof import('typescript/lib/tsserverlibrary') | undefined = options.typescript ? options.typescript.module : undefined;
	const config = options.config ?? {};
	const compilerOptions = options.typescript?.compilerOptions ?? {};
	const autoFetchTypesCdn =
		typeof options.typescript?.autoFetchTypes === 'object'
			&& options.typescript.autoFetchTypes.cdn
			? options.typescript.autoFetchTypes.cdn
			: 'https://unpkg.com/';

	const autoTypeFetchHost = options.typescript?.autoFetchTypes ? createAutoTypesFetchingHost(autoFetchTypesCdn) : undefined;

	let host = createLanguageServiceHost();
	let languageService = _createLanguageService(
		host,
		config,
		{ rootUri: URI.file('/') },
	);
	let webFilesNumOfLanguageService = autoTypeFetchHost?.files.size ?? 0;
	const syncedFiles = new Set<string>();

	class InnocentRabbit { };

	for (const api in languageService) {

		const isFunction = typeof (languageService as any)[api] === 'function';;
		if (!isFunction) {
			(InnocentRabbit.prototype as any)[api] = () => (languageService as any)[api];
			continue;
		}

		(InnocentRabbit.prototype as any)[api] = async (...args: any[]) => {

			if (!autoTypeFetchHost) {
				return (languageService as any)[api](...args);
			}

			let shouldSync = false;
			let webFilesNumOfThisCall = autoTypeFetchHost.files.size;
			let result = await (languageService as any)[api](...args);
			await autoTypeFetchHost.wait();

			while (autoTypeFetchHost.files.size > webFilesNumOfThisCall) {
				shouldSync = true;
				webFilesNumOfThisCall = autoTypeFetchHost.files.size;
				if (autoTypeFetchHost.files.size > webFilesNumOfLanguageService) {
					webFilesNumOfLanguageService = autoTypeFetchHost.files.size;
					languageService.dispose();
					languageService = _createLanguageService(
						host,
						config,
						{ rootUri: URI.file('/') },
					);
				}
				result = await (languageService as any)[api](...args);
				await autoTypeFetchHost.wait();
			}

			if (shouldSync && typeof options.typescript?.autoFetchTypes === 'object' && options.typescript.autoFetchTypes.onFetchTypesFiles) {
				const files = autoTypeFetchHost.files;
				const syncFiles: Record<string, string> = {};
				for (const [fileName, text] of files) {
					if (!syncedFiles.has(fileName) && text !== undefined) {
						syncFiles[fileName] = text;
						syncedFiles.add(fileName);
					}
				}
				options.typescript.autoFetchTypes.onFetchTypesFiles(syncFiles);
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
				if (autoTypeFetchHost) {
					const dts = autoTypeFetchHost.readFile(fileName);
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
				if (autoTypeFetchHost) {
					const webFileText = autoTypeFetchHost.readFile(fileName);
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
				if (autoTypeFetchHost) {
					return autoTypeFetchHost.readFile(fileName);
				}
			},
			fileExists(fileName) {
				const model = options.workerContext.getMirrorModels().find(model => model.uri.fsPath === fileName);
				if (model) {
					return true;
				}
				if (autoTypeFetchHost) {
					return autoTypeFetchHost.fileExists(fileName);
				}
				return false;
			},
			getTypeScriptModule: ts ? (() => ts) : undefined,
		};

		return host;
	}
}
