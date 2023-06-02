import {
	createLanguageService as _createLanguageService,
	type TypeScriptLanguageHost,
	type Config,
} from '@volar/language-service';
import type * as monaco from 'monaco-editor-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';

export function createLanguageService(options: {
	workerContext: monaco.worker.IWorkerContext<any>,
	config: Config,
	typescript?: {
		module: typeof import('typescript/lib/tsserverlibrary'),
		compilerOptions: ts.CompilerOptions,
	},
}) {

	const ts = options.typescript?.module;
	const config = options.config ?? {};
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

	class InnocentRabbit { };

	for (const api in languageService) {
		const isFunction = typeof (languageService as any)[api] === 'function';
		if (isFunction) {
			(InnocentRabbit.prototype as any)[api] = (languageService as any)[api];
		}
	}

	return new InnocentRabbit();

	function createLanguageServiceHost() {

		let projectVersion = 0;

		const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
		const modelVersions = new Map<monaco.worker.IMirrorModel, number>();
		const host: TypeScriptLanguageHost = {
			getProjectVersion() {
				const models = options.workerContext.getMirrorModels();
				if (modelVersions.size === options.workerContext.getMirrorModels().length) {
					if (models.every(model => modelVersions.get(model) === model.version)) {
						return projectVersion;
					}
				}
				modelVersions.clear();
				for (const model of options.workerContext.getMirrorModels()) {
					modelVersions.set(model, model.version);
				}
				projectVersion++;
				return projectVersion;
			},
			getScriptFileNames() {
				const models = options.workerContext.getMirrorModels();
				return models.map(model => model.uri.fsPath);
			},
			getScriptVersion(fileName) {
				const model = options.workerContext.getMirrorModels().find(model => model.uri.fsPath === fileName);
				return model?.version.toString();
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
			},
			getCompilationSettings() {
				return options.typescript?.compilerOptions ?? {};
			},
			getCurrentDirectory() {
				return '/';
			},
		};

		return host;
	}
}
