import {
	Language,
	LanguagePlugin,
	LanguageServicePlugin,
	ProjectContext,
	createLanguageService as _createLanguageService,
	createLanguage,
	createUriMap,
	type LanguageService,
	type LanguageServiceEnvironment,
} from '@volar/language-service';
import { createLanguageServiceHost, createSys, resolveFileLanguageId } from '@volar/typescript';
import type * as monaco from 'monaco-types';
import type * as ts from 'typescript';
import { URI } from 'vscode-uri';

export * from '@volar/language-service';

const fsFileSnapshots = createUriMap<[number | undefined, ts.IScriptSnapshot | undefined]>();

export function createSimpleWorkerService<T = {}>({
	env,
	workerContext,
	languagePlugins,
	languageServicePlugins,
	extraApis = {} as T,
	setup,
}: {
	env: LanguageServiceEnvironment;
	workerContext: monaco.worker.IWorkerContext<any>;
	languagePlugins: LanguagePlugin<URI>[];
	languageServicePlugins: LanguageServicePlugin[];
	extraApis?: T;
	setup?(options: {
		language: Language<URI>;
		project: ProjectContext;
	}): void,
}) {
	const snapshots = new Map<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const language = createLanguage<URI>(
		languagePlugins,
		createUriMap(false),
		uri => {
			const model = workerContext.getMirrorModels().find(model => model.uri.toString() === uri.toString());
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
				language.scripts.set(uri, snapshot);
			}
			else {
				language.scripts.delete(uri);
			}
		}
	);
	const project: ProjectContext = {};
	setup?.({ language, project });

	return createWorkerService(language, languageServicePlugins, env, project, extraApis);
}

export function createTypeScriptWorkerService<T = {}>({
	typescript: ts,
	compilerOptions,
	env,
	uriConverter,
	workerContext,
	languagePlugins,
	languageServicePlugins,
	extraApis = {} as T,
	setup,
}: {
	typescript: typeof import('typescript'),
	compilerOptions: ts.CompilerOptions,
	env: LanguageServiceEnvironment;
	uriConverter: {
		asUri(fileName: string): URI;
		asFileName(uri: URI): string;
	};
	workerContext: monaco.worker.IWorkerContext<any>;
	languagePlugins: LanguagePlugin<URI>[];
	languageServicePlugins: LanguageServicePlugin[];
	extraApis?: T;
	setup?(options: {
		language: Language<URI>;
		project: ProjectContext;
	}): void,
}) {

	let projectVersion = 0;

	const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const modelVersions = new Map<monaco.worker.IMirrorModel, number>();
	const sys = createSys(
		ts.sys,
		env,
		() => {
			if (env.workspaceFolders.length) {
				return uriConverter.asFileName(env.workspaceFolders[0]);
			}
			return '';
		},
		uriConverter
	);
	const language = createLanguage<URI>(
		[
			...languagePlugins,
			{ getLanguageId: uri => resolveFileLanguageId(uri.path) },
		],
		createUriMap(sys.useCaseSensitiveFileNames),
		uri => {
			let snapshot = getModelSnapshot(uri);

			if (!snapshot) {
				// fs files
				const cache = fsFileSnapshots.get(uri);
				const fileName = uriConverter.asFileName(uri);
				const modifiedTime = sys.getModifiedTime?.(fileName)?.valueOf();
				if (!cache || cache[0] !== modifiedTime) {
					if (sys.fileExists(fileName)) {
						const text = sys.readFile(fileName);
						const snapshot = text !== undefined ? ts.ScriptSnapshot.fromString(text) : undefined;
						fsFileSnapshots.set(uri, [modifiedTime, snapshot]);
					}
					else {
						fsFileSnapshots.set(uri, [modifiedTime, undefined]);
					}
				}
				snapshot = fsFileSnapshots.get(uri)?.[1];
			}

			if (snapshot) {
				language.scripts.set(uri, snapshot);
			}
			else {
				language.scripts.delete(uri);
			}
		}
	);
	const project: ProjectContext = {
		typescript: {
			configFileName: undefined,
			sys,
			uriConverter,
			...createLanguageServiceHost(
				ts,
				sys,
				language,
				s => uriConverter.asUri(s),
				{
					getCurrentDirectory() {
						return sys.getCurrentDirectory();
					},
					getScriptFileNames() {
						return workerContext.getMirrorModels().map(model => uriConverter.asFileName(URI.from(model.uri)));
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
						const uri = uriConverter.asUri(fileName);
						return getModelSnapshot(uri);
					},
					getCompilationSettings() {
						return compilerOptions;
					},
				}
			),
		},
	};
	setup?.({ language, project });

	return createWorkerService(
		language,
		languageServicePlugins,
		env,
		project,
		extraApis
	);

	function getModelSnapshot(uri: URI) {
		const model = workerContext.getMirrorModels().find(model => model.uri.toString() === uri.toString());
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
	}
}

function createWorkerService<T = {}>(
	language: Language<URI>,
	servicePlugins: LanguageServicePlugin[],
	env: LanguageServiceEnvironment,
	projectContext: ProjectContext,
	extraApis: T = {} as any
): LanguageService & T {

	const languageService = _createLanguageService(
		language,
		servicePlugins,
		env,
		projectContext
	);

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
