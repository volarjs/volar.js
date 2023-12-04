import {
	LanguagePlugin,
	Language,
	ServicePlugin,
	createLanguageService as _createLanguageService,
	createFileProvider,
	resolveCommonLanguageId,
	type LanguageService,
	type ServiceEnvironment,
} from '@volar/language-service';
import type * as monaco from 'monaco-editor-core';
import type * as ts from 'typescript/lib/tsserverlibrary.js';
import { URI } from 'vscode-uri';
import { createLanguage, createSys, LanguageHost } from '@volar/typescript';

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
				(uri) => {
					const model = getMirrorModels().find(model => model.uri.toString(true) === uri);
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
						files.updateSourceFile(uri, snapshot, resolveCommonLanguageId(uri));
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
	ts: typeof import('typescript/lib/tsserverlibrary.js'),
	languages: LanguagePlugin[],
	services: ServicePlugin[],
	getMirrorModels: monaco.worker.IWorkerContext<any>['getMirrorModels'],
	compilerOptions: ts.CompilerOptions,
	extraApis: T = {} as any,
) {
	return createWorkerService(
		services,
		env => {

			let projectVersion = 0;

			const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
			const modelVersions = new Map<monaco.worker.IMirrorModel, number>();
			const host: LanguageHost = {
				getCurrentDirectory() {
					return env.uriToFileName(env.workspaceFolder.uri.toString(true));
				},
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
				getScriptFileNames() {
					const models = getMirrorModels();
					return models.map(model => env.uriToFileName(model.uri.toString(true)));
				},
				getScriptSnapshot(fileName) {
					const uri = env.fileNameToUri(fileName);
					const model = getMirrorModels().find(model => model.uri.toString(true) === uri);
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
				getFileName: env.uriToFileName,
				getFileId: env.fileNameToUri,
				getLanguageId: id => resolveCommonLanguageId(id),
			};
			const sys = createSys(ts, env, host.getCurrentDirectory());
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
		workspaceFolder: {
			uri: URI.file('/'),
			name: '',
		},
		uriToFileName: uri => URI.parse(uri).fsPath.replace(/\\/g, '/'),
		fileNameToUri: fileName => URI.file(fileName).toString(),
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
