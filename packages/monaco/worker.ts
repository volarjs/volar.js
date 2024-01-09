import {
	LanguagePlugin,
	Language,
	ServicePlugin,
	createLanguageService as _createLanguageService,
	createFileProvider,
	resolveCommonLanguageId,
	type LanguageService,
	type ServiceEnvironment,
	TypeScriptProjectHost,
} from '@volar/language-service';
import type * as monaco from 'monaco-types';
import type * as ts from 'typescript';
import { URI } from 'vscode-uri';
import { createLanguage, createSys } from '@volar/typescript';

export function createSimpleWorkerService<T = {}>(
	languages: LanguagePlugin[],
	services: ServicePlugin[],
	getMirrorModels: monaco.worker.IWorkerContext<any>['getMirrorModels'],
	extraApis: T = {} as any,
) {
	return createWorkerService(
		services,
		() => {
			const snapshots = new Map<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
			const files = createFileProvider(
				languages,
				false,
				uri => {
					const model = getMirrorModels().find(model => model.uri.toString() === uri);
					if (model) {
						const cache = snapshots.get(model);
						if (cache && cache[0] === model.version) {
							return;
						}
						const text = model.getValue();
						const snapshot: ts.IScriptSnapshot = {
							getText: (start, end) => text.substring(start, end),
							getLength: () => text.length,
							getChangeRange: () => undefined,
						};
						snapshots.set(model, [model.version, snapshot]);
						files.updateSourceFile(uri, resolveCommonLanguageId(uri), snapshot);
					}
					else {
						files.deleteSourceFile(uri);
					}
				}
			);

			return { files };
		},
		extraApis
	);
}

export function createTypeScriptWorkerService<T = {}>(
	languages: LanguagePlugin[],
	services: ServicePlugin[],
	getMirrorModels: monaco.worker.IWorkerContext<any>['getMirrorModels'],
	{
		typescript: ts,
		compilerOptions,
		getCurrentDirectory,
		getScriptFileNames,
		getMirrorModel,
		fileNameToUri,
		uriToFileName,
	}: {
		typescript: typeof import('typescript');
		compilerOptions: ts.CompilerOptions;
		getCurrentDirectory(): string;
		getScriptFileNames(): string[];
		getMirrorModel(fileName: string): monaco.worker.IMirrorModel | undefined;
		fileNameToUri(fileName: string): string;
		uriToFileName(uri: string): string;
	},
	extraApis: T = {} as any,
) {
	return createWorkerService(
		services,
		env => {

			let projectVersion = 0;

			const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
			const modelVersions = new Map<monaco.worker.IMirrorModel, number>();
			const host: TypeScriptProjectHost = {
				fileNameToUri,
				uriToFileName,
				getCurrentDirectory,
				getScriptFileNames,
				getProjectVersion() {
					const models = getMirrorModels();
					if (modelVersions.size === getMirrorModels().length) {
						if (models.every(model => modelVersions.get(model) === model.version)) {
							return projectVersion.toString();
						}
					}
					modelVersions.clear();
					for (const model of getMirrorModels()) {
						modelVersions.set(model, model.version);
					}
					projectVersion++;
					return projectVersion.toString();
				},
				getScriptSnapshot(fileName) {
					const model = getMirrorModel(fileName);
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
				},
				getCompilationSettings() {
					return compilerOptions;
				},
				getLanguageId: id => resolveCommonLanguageId(id),
			};
			const sys = createSys(ts, env, host);
			const language = createLanguage(
				ts,
				sys,
				languages,
				undefined,
				host,
			);

			return language;
		},
		extraApis
	);
}

function createWorkerService<T = {}>(
	services: ServicePlugin[],
	getLanguage: (env: ServiceEnvironment) => Language,
	extraApis: T = {} as any,
): LanguageService & T {

	const env: ServiceEnvironment = {
		workspaceFolder: URI.file('/'),
		console,
	};
	const language = getLanguage(env);
	const languageService = _createLanguageService(
		language,
		services,
		env,
	);

	class WorkerService {
		env = env;
		project = language;
	};

	for (const api in languageService) {
		const isFunction = typeof (languageService as any)[api] === 'function';
		if (isFunction) {
			(WorkerService.prototype as any)[api] = (languageService as any)[api];
		}
	}

	for (const api in extraApis) {
		const isFunction = typeof (extraApis as any)[api] === 'function';
		if (isFunction) {
			(WorkerService.prototype as any)[api] = (extraApis as any)[api];
		}
	}

	return new WorkerService() as any;
}
