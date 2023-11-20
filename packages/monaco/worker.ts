import {
	Language,
	Project,
	Service,
	createLanguageService as _createLanguageService,
	createFileProvider,
	resolveCommonLanguageId,
	type LanguageService,
	type ServiceEnvironment,
	type SharedModules,
} from '@volar/language-service';
import type * as monaco from 'monaco-editor-core';
import type * as ts from 'typescript/lib/tsserverlibrary.js';
import { URI } from 'vscode-uri';
import { createProject, createSys, ProjectHost } from '@volar/typescript';

export function createSimpleWorkerService<T = {}>(
	modules: SharedModules,
	languages: Language[],
	services: Service[],
	getMirrorModels: monaco.worker.IWorkerContext<any>['getMirrorModels'],
	extraApis: T = {} as any,
) {
	return createWorkerService(
		modules,
		services,
		() => {
			const snapshots = new Map<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
			const fileProvider = createFileProvider(
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
						fileProvider.updateSourceFile(uri, snapshot, resolveCommonLanguageId(uri));
					}
					else {
						fileProvider.deleteSourceFile(uri);
					}
				}
			);

			return { fileProvider };
		},
		extraApis
	);
}

export function createTypeScriptWorkerService<T = {}>(
	ts: typeof import('typescript/lib/tsserverlibrary.js'),
	languages: Language[],
	services: Service[],
	getMirrorModels: monaco.worker.IWorkerContext<any>['getMirrorModels'],
	compilerOptions: ts.CompilerOptions,
	extraApis: T = {} as any,
) {
	return createWorkerService(
		{ typescript: ts as any },
		services,
		env => {

			let projectVersion = 0;

			const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
			const modelVersions = new Map<monaco.worker.IMirrorModel, number>();
			const projectHost: ProjectHost = {
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
				fileIdToFileName: env.uriToFileName,
				fileNameToFileId: env.fileNameToUri,
				getLanguageId: id => resolveCommonLanguageId(id),
			};
			const sys = createSys(ts, env, projectHost.getCurrentDirectory());
			const project = createProject(
				ts,
				sys,
				languages,
				undefined,
				projectHost,
			);

			return project;
		},
		extraApis
	);
}

function createWorkerService<T = {}>(
	modules: SharedModules,
	services: Service[],
	getProject: (env: ServiceEnvironment) => Project,
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
	const project = getProject(env);
	const languageService = _createLanguageService(
		modules,
		services,
		env,
		project,
	);

	class WorkerService {
		env = env;
		project = project;
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
