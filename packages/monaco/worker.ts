import {
	Language,
	Project,
	Service,
	createLanguageService as _createLanguageService,
	createFileProvider,
	createTypeScriptProject,
	resolveCommonLanguageId,
	type LanguageService,
	type ServiceEnvironment,
	type SharedModules,
	type TypeScriptProjectHost
} from '@volar/language-service';
import type * as monaco from 'monaco-editor-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';

export function createServiceEnvironment(): ServiceEnvironment {
	return {
		workspaceFolder: {
			uri: URI.file('/'),
			name: '',
		},
		uriToFileName: uri => URI.parse(uri).fsPath.replace(/\\/g, '/'),
		fileNameToUri: fileName => URI.file(fileName).toString(),
		console,
	};
}

export function createSimpleMonacoProject(
	getMirrorModels: monaco.worker.IWorkerContext<any>['getMirrorModels'],
	languages: Language[],
	env: ServiceEnvironment
): Project {

	const lastSnapshots = new Map<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const fileProvider = createFileProvider(
		languages,
		() => {
			if (!shouldUpdate())
				return;

			const remain = new Set<monaco.worker.IMirrorModel>(lastSnapshots.keys());

			for (const model of getMirrorModels()) {
				remain.delete(model);
				const cache = lastSnapshots.get(model);
				if (cache && cache[0] === model.version) {
					continue;
				}
				const text = model.getValue();
				const snapshot: ts.IScriptSnapshot = {
					getText: (start, end) => text.substring(start, end),
					getLength: () => text.length,
					getChangeRange: () => undefined,
				};
				const fileName = env.uriToFileName(model.uri.toString(true));
				lastSnapshots.set(model, [model.version, snapshot]);
				fileProvider.updateSource(fileName, snapshot, resolveCommonLanguageId(fileName));
			}
		}
	);

	return { fileProvider };

	function shouldUpdate() {

		const models = getMirrorModels();

		if (lastSnapshots.size === models.length) {
			if (models.every(model => lastSnapshots.get(model)?.[0] === model.version)) {
				return false;
			}
		}

		return true;
	}
}

export function createTypeScriptMonacoProject(
	getMirrorModels: monaco.worker.IWorkerContext<any>['getMirrorModels'],
	languages: Language[],
	env: ServiceEnvironment,
	compilerOptions: ts.CompilerOptions
): Project {

	let projectVersion = 0;

	const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const modelVersions = new Map<monaco.worker.IMirrorModel, number>();
	const host: TypeScriptProjectHost = {
		configFileName: undefined,
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
	};
	const project = createTypeScriptProject(
		host,
		languages,
		resolveCommonLanguageId
	);

	return project;
}

export function createLanguageService<T = {}>(
	modules: SharedModules,
	services: Service[],
	env: ServiceEnvironment,
	project: Project,
	extraApis: T = {} as any,
): LanguageService & T {

	const languageService = _createLanguageService(
		modules,
		services,
		env,
		project,
	);

	class InnocentRabbit { };

	for (const api in languageService) {
		const isFunction = typeof (languageService as any)[api] === 'function';
		if (isFunction) {
			(InnocentRabbit.prototype as any)[api] = (languageService as any)[api];
		}
	}

	for (const api in extraApis) {
		const isFunction = typeof (extraApis as any)[api] === 'function';
		if (isFunction) {
			(InnocentRabbit.prototype as any)[api] = (extraApis as any)[api];
		}
	}

	return new InnocentRabbit() as any;
}
