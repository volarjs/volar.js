import {
	createLanguageService as _createLanguageService,
	type TypeScriptProjectHost,
	type Config,
	type ServiceEnvironment,
	type SharedModules,
	type LanguageService,
} from '@volar/language-service';
import type * as monaco from 'monaco-editor-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';

export function createServiceEnvironment(): ServiceEnvironment {
	return {
		uriToFileName: uri => URI.parse(uri).fsPath.replace(/\\/g, '/'),
		fileNameToUri: fileName => URI.file(fileName).toString(),
		workspaceUri: URI.file('/'),
		rootUri: URI.file('/'),
		console,
	};
}

export function createProjectHost(
	getMirrorModels: monaco.worker.IWorkerContext<any>['getMirrorModels'],
	env: ServiceEnvironment,
	rootPath: string,
	compilerOptions: ts.CompilerOptions = {}
): TypeScriptProjectHost {

	let projectVersion = 0;

	const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const modelVersions = new Map<monaco.worker.IMirrorModel, number>();
	const host: TypeScriptProjectHost = {
		workspacePath: rootPath,
		rootPath: rootPath,
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

	return host;
}

export function createLanguageService<T = {}>(
	modules: SharedModules,
	env: ServiceEnvironment,
	config: Config,
	host: TypeScriptProjectHost,
	extraApis: T = {} as any,
): LanguageService & T {

	const languageService = _createLanguageService(
		modules,
		env,
		config,
		host,
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
