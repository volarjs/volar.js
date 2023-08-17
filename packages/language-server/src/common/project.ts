import { FileSystem, LanguageService, ServiceEnvironment, TypeScriptLanguageHost, createLanguageService } from '@volar/language-service';
import * as path from 'typesafe-path/posix';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { LanguageServerPlugin } from '../types';
import { loadConfig } from './utils/serverConfig';
import { createUriMap } from './utils/uriMap';
import { createSys } from '@volar/typescript';
import { WorkspacesContext } from './workspaces';

export interface ProjectContext extends WorkspacesContext {
	project: {
		workspaceUri: URI;
		rootUri: URI;
		tsConfig: path.PosixPath | ts.CompilerOptions;
	};
}

export type Project = ReturnType<typeof createProject>;

const globalSnapshots = new WeakMap<FileSystem, ReturnType<typeof createUriMap<ts.IScriptSnapshot | undefined>>>();

export async function createProject(context: ProjectContext) {

	let projectVersion = 0;
	let token = context.workspaces.cancelTokenHost.createCancellationToken();
	let languageService: LanguageService | undefined;

	const tsToken: ts.CancellationToken = {
		isCancellationRequested() {
			return token.isCancellationRequested;
		},
		throwIfCancellationRequested() { },
	};
	const { uriToFileName, fileNameToUri, fs } = context.server.runtimeEnv;
	const env: ServiceEnvironment = {
		uriToFileName,
		fileNameToUri,
		fs,
		console: context.server.runtimeEnv.console,
		locale: context.workspaces.initParams.locale,
		workspaceUri: context.project.workspaceUri,
		rootUri: context.project.rootUri,
		clientCapabilities: context.workspaces.initParams.capabilities,
		getConfiguration: context.server.configurationHost?.getConfiguration,
		onDidChangeConfiguration: context.server.configurationHost?.onDidChangeConfiguration,
		onDidChangeWatchedFiles: context.server.onDidChangeWatchedFiles,
	};

	if (!globalSnapshots.has(fs)) {
		globalSnapshots.set(fs, createUriMap(fileNameToUri));
	}

	const askedFiles = createUriMap<boolean>(fileNameToUri);
	const languageHost: TypeScriptLanguageHost = {
		workspacePath: uriToFileName(context.project.workspaceUri.toString()),
		rootPath: uriToFileName(context.project.rootUri.toString()),
		getProjectVersion: () => projectVersion.toString(),
		getScriptFileNames: () => parsedCommandLine.fileNames,
		getScriptSnapshot: (fileName) => {
			askedFiles.pathSet(fileName, true);
			const doc = context.workspaces.documents.data.pathGet(fileName);
			if (doc) {
				return doc.getSnapshot();
			}
			const fsSnapshot = globalSnapshots.get(fs)!.pathGet(fileName);
			if (fsSnapshot) {
				return fsSnapshot;
			}
		},
		getLanguageId: (fileName) => context.workspaces.documents.data.pathGet(fileName)?.languageId,
		getCancellationToken: () => tsToken,
		getCompilationSettings: () => parsedCommandLine.options,
		getLocalizedDiagnosticMessages: context.workspaces.tsLocalized ? () => context.workspaces.tsLocalized : undefined,
		getProjectReferences: () => parsedCommandLine.projectReferences,
	};
	const docChangeWatcher = context.workspaces.documents.onDidChangeContent(() => {
		projectVersion++;
		token = context.workspaces.cancelTokenHost.createCancellationToken();
	});
	const fileWatch = env.onDidChangeWatchedFiles?.(params => {
		onWorkspaceFilesChanged(params.changes);
	});

	let existingOptions: ts.CompilerOptions | undefined;

	for (const plugin of context.workspaces.plugins) {
		if (plugin.resolveExistingOptions) {
			existingOptions = plugin.resolveExistingOptions(existingOptions);
		}
	}

	let parsedCommandLine = await createParsedCommandLine(
		context.workspaces.ts,
		env,
		uriToFileName(context.project.rootUri.toString()) as path.PosixPath,
		context.project.tsConfig,
		context.workspaces.plugins,
		existingOptions,
	);
	let config = (
		context.project.workspaceUri.scheme === 'file' ? loadConfig(
			context.server.runtimeEnv.console,
			context.server.runtimeEnv.uriToFileName(context.project.workspaceUri.toString()),
			context.workspaces.initOptions.configFilePath,
		) : {}
	) ?? {};
	for (const plugin of context.workspaces.plugins) {
		if (plugin.resolveConfig) {
			config = await plugin.resolveConfig(config, {
				...context,
				env,
				host: languageHost,
			});
		}
	}

	await syncRootScriptSnapshots();

	return {
		context,
		tsConfig: context.project.tsConfig,
		languageHost,
		getLanguageService,
		getLanguageServiceDontCreate: () => languageService,
		getParsedCommandLine: () => parsedCommandLine,
		tryAddFile: (fileName: string) => {
			if (!parsedCommandLine.fileNames.includes(fileName)) {
				parsedCommandLine.fileNames.push(fileName);
				projectVersion++;
				token = context.workspaces.cancelTokenHost.createCancellationToken();
			}
		},
		askedFiles,
		dispose,
	};

	function getLanguageService() {
		if (!languageService) {
			languageService = createLanguageService(
				{ typescript: context.workspaces.ts },
				env,
				config,
				languageHost,
			);
		}
		return languageService;
	}
	async function syncRootScriptSnapshots() {
		const promises: Promise<void>[] = [];
		let dirty = false;
		for (const fileName of parsedCommandLine.fileNames) {
			const uri = fileNameToUri(fileName);
			if (!globalSnapshots.get(fs)!.uriGet(uri)) {
				dirty = true;
				promises.push(updateRootScriptSnapshot(uri));
			}
		}
		await Promise.all(promises);
		return dirty;
	}
	async function updateRootScriptSnapshot(uri: string) {
		const text = await context.server.runtimeEnv.fs.readFile(uri);
		globalSnapshots.get(fs)!.uriSet(uri,
			text !== undefined ? {
				getText: (start, end) => text.substring(start, end),
				getLength: () => text.length,
				getChangeRange: () => undefined,
			} : undefined,
		);
	}
	async function onWorkspaceFilesChanged(changes: vscode.FileEvent[]) {

		const oldProjectVersion = projectVersion;
		const creates = changes.filter(change => change.type === vscode.FileChangeType.Created);

		if (creates.length) {
			parsedCommandLine = await createParsedCommandLine(
				context.workspaces.ts,
				env,
				uriToFileName(context.project.rootUri.toString()) as path.PosixPath,
				context.project.tsConfig,
				context.workspaces.plugins,
				existingOptions,
			);
			if (await syncRootScriptSnapshots()) {
				projectVersion++;
			}
		}

		for (const change of changes) {
			if (askedFiles.uriGet(change.uri) && globalSnapshots.get(fs)!.uriGet(change.uri)) {
				if (change.type === vscode.FileChangeType.Changed) {
					updateRootScriptSnapshot(change.uri);
				}
				else if (change.type === vscode.FileChangeType.Deleted) {
					globalSnapshots.get(fs)!.uriSet(change.uri, undefined);
				}
				projectVersion++;
			}
		}

		if (oldProjectVersion !== projectVersion) {
			token = context.workspaces.cancelTokenHost.createCancellationToken();
		}
	}
	function dispose() {
		languageService?.dispose();
		fileWatch?.dispose();
		docChangeWatcher.dispose();
	}
}

async function createParsedCommandLine(
	ts: typeof import('typescript/lib/tsserverlibrary') | undefined,
	env: ServiceEnvironment,
	rootPath: path.PosixPath,
	tsConfig: path.PosixPath | ts.CompilerOptions,
	plugins: ReturnType<LanguageServerPlugin>[],
	existingOptions: ts.CompilerOptions | undefined,
): Promise<ts.ParsedCommandLine> {
	const extraFileExtensions = plugins.map(plugin => plugin.extraFileExtensions ?? []).flat();
	if (ts) {
		const sys = createSys(ts, {
			...env,
			onDidChangeWatchedFiles: undefined,
		});
		let content: ts.ParsedCommandLine | undefined;
		let sysVersion: number | undefined;
		let newSysVersion = await sys.sync();
		while (sysVersion !== newSysVersion) {
			sysVersion = newSysVersion;
			try {
				if (typeof tsConfig === 'string') {
					const config = ts.readJsonConfigFile(tsConfig, sys.readFile);
					content = ts.parseJsonSourceFileConfigFileContent(config, sys, path.dirname(tsConfig), existingOptions, tsConfig, undefined, extraFileExtensions);
				}
				else {
					content = ts.parseJsonConfigFileContent({ files: [] }, sys, rootPath, { ...tsConfig, ...existingOptions }, rootPath + '/jsconfig.json', undefined, extraFileExtensions);
				}
				// fix https://github.com/johnsoncodehk/volar/issues/1786
				// https://github.com/microsoft/TypeScript/issues/30457
				// patching ts server broke with outDir + rootDir + composite/incremental
				content.options.outDir = undefined;
				content.fileNames = content.fileNames.map(fileName => fileName.replace(/\\/g, '/'));
			}
			catch {
				// will be failed if web fs host first result not ready
			}
			newSysVersion = await sys.sync();
		}
		if (content) {
			return content;
		}
	}
	return {
		errors: [],
		fileNames: [],
		options: {},
	};
}
