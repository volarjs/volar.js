import {
	createLanguageService as _createLanguageService,
	type TypeScriptLanguageHost,
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
		rootUri: URI.file('/'),
	};
}

export function createLanguageHost(
	workerContext: monaco.worker.IWorkerContext<any>,
	env: ServiceEnvironment,
	compilerOptions: ts.CompilerOptions = {}
): TypeScriptLanguageHost {

	let projectVersion = 0;

	const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const modelVersions = new Map<monaco.worker.IMirrorModel, number>();
	const host: TypeScriptLanguageHost = {
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
		getScriptFileNames() {
			const models = workerContext.getMirrorModels();
			return models.map(model => env.uriToFileName(model.uri.toString()));
		},
		getScriptSnapshot(fileName) {
			const uri = env.fileNameToUri(fileName);
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
		getCurrentDirectory() {
			return '/';
		},
	};

	return host;
}

export function createLanguageService(
	modules: SharedModules,
	env: ServiceEnvironment,
	config: Config,
	host: TypeScriptLanguageHost,
) {

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

	return new InnocentRabbit() as LanguageService;
}
