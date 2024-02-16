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

export * from '@volar/language-service';
export * from './lib/ata.js';

export function createSimpleWorkerService<T = {}>({
	env,
	workerContext,
	languagePlugins = [],
	servicePlugins = [],
	extraApis = {} as T
}: {
	env: ServiceEnvironment;
	workerContext: monaco.worker.IWorkerContext<any>;
	languagePlugins?: LanguagePlugin[];
	servicePlugins?: ServicePlugin[];
	extraApis?: T;
}) {
	const snapshots = new Map<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const files = createFileRegistry(
		languagePlugins,
		false,
		uri => {
			const model = workerContext.getMirrorModels().find(model => model.uri.toString() === uri);
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

	return createWorkerService({ files }, servicePlugins, env, extraApis);
}

export function createTypeScriptWorkerService<T = {}>({
	typescript: ts,
	compilerOptions,
	env,
	workerContext,
	languagePlugins = [],
	servicePlugins = [],
	extraApis = {} as T
}: {
	typescript: typeof import('typescript'),
	compilerOptions: ts.CompilerOptions,
	env: ServiceEnvironment;
	workerContext: monaco.worker.IWorkerContext<any>;
	languagePlugins?: LanguagePlugin[];
	servicePlugins?: ServicePlugin[];
	extraApis?: T;
}) {

	let projectVersion = 0;

	const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const modelVersions = new Map<monaco.worker.IMirrorModel, number>();
	const sys = createSys(ts, env, env.typescript!.uriToFileName(env.workspaceFolder));
	const host: TypeScriptProjectHost = {
		getCurrentDirectory() {
			return env.typescript!.uriToFileName(env.workspaceFolder);
		},
		getScriptFileNames() {
			return workerContext.getMirrorModels().map(model => env.typescript!.uriToFileName(model.uri.toString()));
		},
		getProjectVersion() {
			const models = workerContext.getMirrorModels();
			if (modelVersions.size === workerContext.getMirrorModels().length) {
				if (models.every(model => modelVersions.get(model) === model.version)) {
					return projectVersion.toString();
				}
			}
			modelVersions.clear();
			for (const model of workerContext.getMirrorModels()) {
				modelVersions.set(model, model.version);
			}
			projectVersion++;
			return projectVersion.toString();
		},
		getScriptSnapshot(fileName) {
			const uri = env.typescript!.fileNameToUri(fileName);
			const model = workerContext.getMirrorModels().find(model => model.uri.toString() === uri);
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
	const languageContext = createLanguage(
		ts,
		sys,
		languagePlugins,
		undefined,
		host,
		{
			fileNameToFileId: env.typescript!.fileNameToUri,
			fileIdToFileName: env.typescript!.uriToFileName,
		},
	);

	return createWorkerService(languageContext, servicePlugins, env, extraApis);
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
