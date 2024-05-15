import { FileType, LanguagePlugin, ProviderResult, ServiceEnvironment, TypeScriptProjectHost } from '@volar/language-service';
import type { createSys } from '@volar/typescript';
import * as path from 'path-browserify';
import type * as ts from 'typescript';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import type { ServerBase, ServerProjectProvider } from '../types';
import { isFileInDir } from '../utils/isFileInDir';
import { createUriMap } from '../utils/uriMap';
import { getInferredCompilerOptions } from './inferredCompilerOptions';
import { createServiceEnvironment, getWorkspaceFolder } from './simpleProjectProvider';
import { createTypeScriptServerProject, type TypeScriptServerProject } from './typescriptProject';

const rootTsConfigNames = ['tsconfig.json', 'jsconfig.json'];

export function createTypeScriptProjectProvider(
	ts: typeof import('typescript'),
	tsLocalized: ts.MapLike<string> | undefined,
	getLanguagePlugins: (serviceEnv: ServiceEnvironment, projectContext: {
		configFileName: string | undefined;
		host: TypeScriptProjectHost;
		sys: ReturnType<typeof createSys>;
	}) => ProviderResult<LanguagePlugin[]>,
) {
	let initialized = false;

	const configProjects = createUriMap<Promise<TypeScriptServerProject>>();
	const inferredProjects = createUriMap<Promise<TypeScriptServerProject>>();
	const rootTsConfigs = new Set<string>();
	const searchedDirs = new Set<string>();
	const projects: ServerProjectProvider = {
		async get(uri) {
			if (!initialized) {
				initialized = true;
				initialize(this);
			}
			const tsconfig = await findMatchTSConfig(this, URI.parse(uri));
			if (tsconfig) {
				return await getOrCreateConfiguredProject(this, tsconfig);
			}
			const workspaceFolder = getWorkspaceFolder(uri, this.workspaceFolders);
			return await getOrCreateInferredProject(this, uri, workspaceFolder);
		},
		async all() {
			return await Promise.all([
				...configProjects.values() ?? [],
				...inferredProjects.values() ?? [],
			]);
		},
		reload() {
			for (const project of [
				...configProjects.values() ?? [],
				...inferredProjects.values() ?? [],
			]) {
				project.then(p => p.dispose());
			}
			configProjects.clear();
			inferredProjects.clear();
		},
	};
	return projects;

	function initialize(server: ServerBase) {
		server.onDidChangeWatchedFiles(({ changes }) => {
			const tsConfigChanges = changes.filter(change => rootTsConfigNames.includes(change.uri.substring(change.uri.lastIndexOf('/') + 1)));

			for (const change of tsConfigChanges) {
				if (change.type === vscode.FileChangeType.Created) {
					rootTsConfigs.add(server.uriConverter.uriToFileName(change.uri));
				}
				else if ((change.type === vscode.FileChangeType.Changed || change.type === vscode.FileChangeType.Deleted) && configProjects.has(change.uri)) {
					if (change.type === vscode.FileChangeType.Deleted) {
						rootTsConfigs.delete(server.uriConverter.uriToFileName(change.uri));
					}
					const project = configProjects!.get(change.uri);
					configProjects!.delete(change.uri);
					project?.then(project => project.dispose());
				}
			}

			if (tsConfigChanges.length) {
				server.clearPushDiagnostics();
			}
			server.refresh(projects);
		});
	}

	async function findMatchTSConfig(server: ServerBase, uri: URI) {

		const filePath = server.uriConverter.uriToFileName(uri.toString());
		let dir = path.dirname(filePath);

		while (true) {
			if (searchedDirs.has(dir)) {
				break;
			}
			searchedDirs.add(dir);
			for (const tsConfigName of rootTsConfigNames) {
				const tsconfigPath = path.join(dir, tsConfigName);
				if ((await server.fs.stat?.(server.uriConverter.fileNameToUri(tsconfigPath)))?.type === FileType.File) {
					rootTsConfigs.add(tsconfigPath);
				}
			}
			dir = path.dirname(dir);
		}

		await prepareClosestootParsedCommandLine();

		return await findDirectIncludeTsconfig() ?? await findIndirectReferenceTsconfig();

		async function prepareClosestootParsedCommandLine() {

			let matches: string[] = [];

			for (const rootTsConfig of rootTsConfigs) {
				if (isFileInDir(server.uriConverter.uriToFileName(uri.toString()), path.dirname(rootTsConfig))) {
					matches.push(rootTsConfig);
				}
			}

			matches = matches.sort((a, b) => sortTSConfigs(server.uriConverter.uriToFileName(uri.toString()), a, b));

			if (matches.length) {
				await getParsedCommandLine(matches[0]);
			}
		}
		function findIndirectReferenceTsconfig() {
			return findTSConfig(async tsconfig => {
				const tsconfigUri = server.uriConverter.fileNameToUri(tsconfig);
				const project = await configProjects.get(tsconfigUri);
				return project?.askedFiles.has(uri.toString()) ?? false;
			});
		}
		function findDirectIncludeTsconfig() {
			return findTSConfig(async tsconfig => {
				const map = createUriMap<boolean>();
				const parsedCommandLine = await getParsedCommandLine(tsconfig);
				for (const fileName of parsedCommandLine?.fileNames ?? []) {
					const uri = server.uriConverter.fileNameToUri(fileName);
					map.set(uri, true);
				}
				return map.has(uri.toString());
			});
		}
		async function findTSConfig(match: (tsconfig: string) => Promise<boolean> | boolean) {

			const checked = new Set<string>();

			for (const rootTsConfig of [...rootTsConfigs].sort((a, b) => sortTSConfigs(server.uriConverter.uriToFileName(uri.toString()), a, b))) {
				const tsconfigUri = server.uriConverter.fileNameToUri(rootTsConfig);
				const project = await configProjects.get(tsconfigUri);
				if (project) {

					let chains = await getReferencesChains(project.getParsedCommandLine(), rootTsConfig, []);

					// This is to be consistent with tsserver behavior
					chains = chains.reverse();

					for (const chain of chains) {
						for (let i = chain.length - 1; i >= 0; i--) {
							const tsconfig = chain[i];

							if (checked.has(tsconfig)) {
								continue;
							}
							checked.add(tsconfig);

							if (await match(tsconfig)) {
								return tsconfig;
							}
						}
					}
				}
			}
		}
		async function getReferencesChains(parsedCommandLine: ts.ParsedCommandLine, tsConfig: string, before: string[]) {

			if (parsedCommandLine.projectReferences?.length) {

				const newChains: string[][] = [];

				for (const projectReference of parsedCommandLine.projectReferences) {

					let tsConfigPath = projectReference.path.replace(/\\/g, '/');

					// fix https://github.com/johnsoncodehk/volar/issues/712
					if ((await server.fs.stat?.(server.uriConverter.fileNameToUri(tsConfigPath)))?.type === FileType.File) {
						const newTsConfigPath = path.join(tsConfigPath, 'tsconfig.json');
						const newJsConfigPath = path.join(tsConfigPath, 'jsconfig.json');
						if ((await server.fs.stat?.(server.uriConverter.fileNameToUri(newTsConfigPath)))?.type === FileType.File) {
							tsConfigPath = newTsConfigPath;
						}
						else if ((await server.fs.stat?.(server.uriConverter.fileNameToUri(newJsConfigPath)))?.type === FileType.File) {
							tsConfigPath = newJsConfigPath;
						}
					}

					const beforeIndex = before.indexOf(tsConfigPath); // cycle
					if (beforeIndex >= 0) {
						newChains.push(before.slice(0, Math.max(beforeIndex, 1)));
					}
					else {
						const referenceParsedCommandLine = await getParsedCommandLine(tsConfigPath);
						if (referenceParsedCommandLine) {
							for (const chain of await getReferencesChains(referenceParsedCommandLine, tsConfigPath, [...before, tsConfig])) {
								newChains.push(chain);
							}
						}
					}
				}

				return newChains;
			}
			else {
				return [[...before, tsConfig]];
			}
		}
		async function getParsedCommandLine(tsConfig: string) {
			const project = await getOrCreateConfiguredProject(server, tsConfig);
			return project?.getParsedCommandLine();
		}
	}

	function getOrCreateConfiguredProject(server: ServerBase, tsconfig: string) {
		tsconfig = tsconfig.replace(/\\/g, '/');
		const tsconfigUri = server.uriConverter.fileNameToUri(tsconfig);
		let projectPromise = configProjects.get(tsconfigUri);
		if (!projectPromise) {
			const workspaceFolder = getWorkspaceFolder(tsconfigUri, server.workspaceFolders);
			const serviceEnv = createServiceEnvironment(server, workspaceFolder);
			projectPromise = createTypeScriptServerProject(
				ts,
				tsLocalized,
				tsconfig,
				server,
				serviceEnv,
				getLanguagePlugins,
			);
			configProjects.set(tsconfigUri, projectPromise);
		}
		return projectPromise;
	}

	async function getOrCreateInferredProject(server: ServerBase, uri: string, workspaceFolder: string) {

		if (!inferredProjects.has(workspaceFolder)) {
			inferredProjects.set(workspaceFolder, (async () => {
				const inferOptions = await getInferredCompilerOptions(server);
				const serviceEnv = createServiceEnvironment(server, workspaceFolder);
				return createTypeScriptServerProject(
					ts,
					tsLocalized,
					inferOptions,
					server,
					serviceEnv,
					getLanguagePlugins,
				);
			})());
		}

		const project = await inferredProjects.get(workspaceFolder.toString())!;

		project.tryAddFile(server.uriConverter.uriToFileName(uri));

		return project;
	}
}

export function sortTSConfigs(file: string, a: string, b: string) {

	const inA = isFileInDir(file, path.dirname(a));
	const inB = isFileInDir(file, path.dirname(b));

	if (inA !== inB) {
		const aWeight = inA ? 1 : 0;
		const bWeight = inB ? 1 : 0;
		return bWeight - aWeight;
	}

	const aLength = a.split('/').length;
	const bLength = b.split('/').length;

	if (aLength === bLength) {
		const aWeight = path.basename(a) === 'tsconfig.json' ? 1 : 0;
		const bWeight = path.basename(b) === 'tsconfig.json' ? 1 : 0;
		return bWeight - aWeight;
	}

	return bLength - aLength;
}
