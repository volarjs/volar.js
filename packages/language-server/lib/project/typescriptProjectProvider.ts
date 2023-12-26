import { FileType } from '@volar/language-service';
import * as path from 'path-browserify';
import type * as ts from 'typescript';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import type { ServerProjectProvider, ServerProjectProviderFactory } from '../types';
import { isFileInDir } from '../utils/isFileInDir';
import { createUriMap } from '../utils/uriMap';
import { getInferredCompilerOptions } from './inferredCompilerOptions';
import { createServiceEnvironment, getWorkspaceFolder } from './simpleProjectProvider';
import { createTypeScriptServerProject, type TypeScriptServerProject } from './typescriptProject';

const rootTsConfigNames = ['tsconfig.json', 'jsconfig.json'];

export const createTypeScriptProjectProvider: ServerProjectProviderFactory = (context, serverOptions, servicePlugins): ServerProjectProvider => {

	const { fileNameToUri, uriToFileName, fs } = context.runtimeEnv;
	const configProjects = createUriMap<Promise<TypeScriptServerProject>>(fileNameToUri);
	const inferredProjects = createUriMap<Promise<TypeScriptServerProject>>(fileNameToUri);
	const rootTsConfigs = new Set<string>();
	const searchedDirs = new Set<string>();

	context.onDidChangeWatchedFiles(({ changes }) => {
		const tsConfigChanges = changes.filter(change => rootTsConfigNames.includes(change.uri.substring(change.uri.lastIndexOf('/') + 1)));

		for (const change of tsConfigChanges) {
			if (change.type === vscode.FileChangeType.Created) {
				rootTsConfigs.add(uriToFileName(change.uri));
			}
			else if ((change.type === vscode.FileChangeType.Changed || change.type === vscode.FileChangeType.Deleted) && configProjects.uriHas(change.uri)) {
				if (change.type === vscode.FileChangeType.Deleted) {
					rootTsConfigs.delete(uriToFileName(change.uri));
				}
				const project = configProjects.uriGet(change.uri);
				configProjects.uriDelete(change.uri);
				project?.then(project => project.dispose());
			}
		}

		if (tsConfigChanges.length) {
			context.reloadDiagnostics();
		}
		else {
			context.updateDiagnosticsAndSemanticTokens();
		}
	});

	context.workspaceFolders.onDidRemove(folder => {
		for (const uri of configProjects.uriKeys()) {
			const project = configProjects.uriGet(uri)!;
			project.then(project => {
				if (project.serviceEnv.workspaceFolder.toString() === folder.toString()) {
					configProjects.uriDelete(uri);
					project.dispose();
				}
			});
		}
	});

	return {
		async getProject(uri) {
			const tsconfig = await findMatchTSConfig(URI.parse(uri));
			if (tsconfig) {
				return await getOrCreateConfiguredProject(tsconfig);
			}
			const workspaceFolder = getWorkspaceFolder(uri, context.workspaceFolders, uriToFileName);
			return await getOrCreateInferredProject(uri, workspaceFolder);
		},
		async getProjects() {
			return await Promise.all([
				...configProjects.values(),
				...inferredProjects.values(),
			]);
		},
		reloadProjects() {

			for (const project of [...configProjects.values(), ...inferredProjects.values()]) {
				project.then(project => project.dispose());
			}

			configProjects.clear();
			inferredProjects.clear();

			context.reloadDiagnostics();
		},
	};

	async function findMatchTSConfig(uri: URI) {

		const filePath = uriToFileName(uri.toString());
		let dir = path.dirname(filePath);

		while (true) {
			if (searchedDirs.has(dir)) {
				break;
			}
			searchedDirs.add(dir);
			for (const tsConfigName of rootTsConfigNames) {
				const tsconfigPath = path.join(dir, tsConfigName);
				if ((await fs.stat?.(fileNameToUri(tsconfigPath)))?.type === FileType.File) {
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
				if (isFileInDir(uriToFileName(uri.toString()), path.dirname(rootTsConfig))) {
					matches.push(rootTsConfig);
				}
			}

			matches = matches.sort((a, b) => sortTSConfigs(uriToFileName(uri.toString()), a, b));

			if (matches.length) {
				await getParsedCommandLine(matches[0]);
			}
		}
		function findIndirectReferenceTsconfig() {
			return findTSConfig(async tsconfig => {
				const project = await configProjects.pathGet(tsconfig);
				return project?.askedFiles.uriHas(uri.toString()) ?? false;
			});
		}
		function findDirectIncludeTsconfig() {
			return findTSConfig(async tsconfig => {
				const map = createUriMap<boolean>(fileNameToUri);
				const parsedCommandLine = await getParsedCommandLine(tsconfig);
				for (const fileName of parsedCommandLine?.fileNames ?? []) {
					map.pathSet(fileName, true);
				}
				return map.uriHas(uri.toString());
			});
		}
		async function findTSConfig(match: (tsconfig: string) => Promise<boolean> | boolean) {

			const checked = new Set<string>();

			for (const rootTsConfig of [...rootTsConfigs].sort((a, b) => sortTSConfigs(uriToFileName(uri.toString()), a, b))) {
				const project = await configProjects.pathGet(rootTsConfig);
				if (project) {

					let chains = await getReferencesChains(project.getParsedCommandLine(), rootTsConfig, []);

					if (context.initializeParams.initializationOptions?.reverseConfigFilePriority) {
						chains = chains.reverse();
					}

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
					if ((await fs.stat?.(fileNameToUri(tsConfigPath)))?.type === FileType.File) {
						const newTsConfigPath = path.join(tsConfigPath, 'tsconfig.json');
						const newJsConfigPath = path.join(tsConfigPath, 'jsconfig.json');
						if ((await fs.stat?.(fileNameToUri(newTsConfigPath)))?.type === FileType.File) {
							tsConfigPath = newTsConfigPath;
						}
						else if ((await fs.stat?.(fileNameToUri(newJsConfigPath)))?.type === FileType.File) {
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
			const project = await getOrCreateConfiguredProject(tsConfig);
			return project?.getParsedCommandLine();
		}
	}

	function getOrCreateConfiguredProject(tsconfig: string) {
		tsconfig = tsconfig.replace(/\\/g, '/');
		let projectPromise = configProjects.pathGet(tsconfig);
		if (!projectPromise) {
			const workspaceFolder = getWorkspaceFolder(fileNameToUri(tsconfig), context.workspaceFolders, uriToFileName);
			const serviceEnv = createServiceEnvironment(context, workspaceFolder);
			projectPromise = createTypeScriptServerProject(tsconfig, context, serviceEnv, serverOptions, servicePlugins);
			configProjects.pathSet(tsconfig, projectPromise);
		}
		return projectPromise;
	}

	async function getOrCreateInferredProject(uri: string, workspaceFolder: URI) {

		if (!inferredProjects.uriHas(workspaceFolder.toString())) {
			inferredProjects.uriSet(workspaceFolder.toString(), (async () => {
				const inferOptions = await getInferredCompilerOptions(context.configurationHost);
				const serviceEnv = createServiceEnvironment(context, workspaceFolder);
				return createTypeScriptServerProject(inferOptions, context, serviceEnv, serverOptions, servicePlugins);
			})());
		}

		const project = await inferredProjects.uriGet(workspaceFolder.toString())!;

		project.tryAddFile(uriToFileName(uri));

		return project;
	}
};

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
