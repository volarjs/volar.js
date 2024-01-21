import {
	LanguagePlugin,
	LanguageContext,
	ServicePlugin,
	createLanguageService as _createLanguageService,
	createFileRegistry,
	resolveCommonLanguageId,
	type LanguageService,
	type ServiceEnvironment,
	TypeScriptProjectHost,
} from '@volar/language-service';
import type * as monaco from 'monaco-types';
import type * as ts from 'typescript';
import { createLanguage, createSys } from '@volar/typescript';

export * from './lib/ata.js';

export function createSimpleWorkerService<T = {}>(
	languages: LanguagePlugin[],
	services: ServicePlugin[],
	env: ServiceEnvironment,
	getMirrorModels: monaco.worker.IWorkerContext<any>['getMirrorModels'],
	extraApis: T = {} as any,
) {
	const snapshots = new Map<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const files = createFileRegistry(
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
				files.set(uri, resolveCommonLanguageId(uri), snapshot);
			}
			else {
				files.delete(uri);
			}
		}
	);

	return createWorkerService(
		{ files },
		services,
		env,
		extraApis
	);
}

export function createTypeScriptWorkerService<T = {}>(
	ts: typeof import('typescript'),
	compilerOptions: ts.CompilerOptions,
	languages: LanguagePlugin[],
	services: ServicePlugin[],
	env: ServiceEnvironment,
	getMirrorModels: monaco.worker.IWorkerContext<any>['getMirrorModels'],
	extraApis: T = {} as any,
) {

	let projectVersion = 0;

	const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const modelVersions = new Map<monaco.worker.IMirrorModel, number>();
	const host: TypeScriptProjectHost = {
		getCurrentDirectory() {
			return env.typescript!.uriToFileName(env.workspaceFolder);
		},
		getScriptFileNames() {
			return getMirrorModels().map(model => env.typescript!.uriToFileName(model.uri.toString()));
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
		getScriptSnapshot(fileName) {
			const uri = env.typescript!.fileNameToUri(fileName);
			const model = getMirrorModels().find(model => model.uri.toString() === uri);
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
		{
			fileNameToFileId: env.typescript!.fileNameToUri,
			fileIdToFileName: env.typescript!.uriToFileName,
		},
	);

	return createWorkerService(language, services, env, extraApis);
}

function createWorkerService<T = {}>(
	languageContext: LanguageContext,
	servicePlugins: ServicePlugin[],
	env: ServiceEnvironment,
	extraApis: T = {} as any,
): LanguageService & T {

	const languageService = _createLanguageService(languageContext, servicePlugins, env);

	class WorkerService { };

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
