import { FileSystem, LanguageService, ServiceEnvironment, createLanguageService, createTypeScriptProject, TypeScriptProjectHost, resolveCommonLanguageId } from '@volar/language-service';
import * as path from 'path-browserify';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver';
import { TypeScriptServerPlugin, ServerProject } from '../types';
import { UriMap, createUriMap } from '../utils/uriMap';
import { createSys } from '@volar/typescript';
import { WorkspacesContext } from './simpleProjectProvider';
import { getConfig } from '../config';

const globalSnapshots = new WeakMap<FileSystem, ReturnType<typeof createUriMap<ts.IScriptSnapshot | undefined>>>();

export interface TypeScriptServerProject extends ServerProject {
	askedFiles: UriMap<boolean>;
	tryAddFile(fileName: string): void;
	getParsedCommandLine(): ts.ParsedCommandLine;
}

export async function createTypeScriptServerProject(
	tsconfig: string | ts.CompilerOptions,
	context: WorkspacesContext,
	plugins: ReturnType<TypeScriptServerPlugin>[],
	serviceEnv: ServiceEnvironment,
): Promise<TypeScriptServerProject> {

	let rootFiles = await getRootFiles();
	let projectVersion = 0;
	let token = context.server.runtimeEnv.getCancellationToken();
	let languageService: LanguageService | undefined;
	let parsedCommandLine: ts.ParsedCommandLine;

	const tsToken: ts.CancellationToken = {
		isCancellationRequested() {
			return token.isCancellationRequested;
		},
		throwIfCancellationRequested() { },
	};
	const { uriToFileName, fileNameToUri, fs } = context.server.runtimeEnv;

	if (!globalSnapshots.has(fs)) {
		globalSnapshots.set(fs, createUriMap(fileNameToUri));
	}

	const askedFiles = createUriMap<boolean>(fileNameToUri);
	const typescriptProjectHost: TypeScriptProjectHost = {
		configFileName: typeof tsconfig === 'string' ? tsconfig : undefined,
		getCurrentDirectory: () => uriToFileName(serviceEnv.workspaceFolder.uri.toString()),
		getProjectVersion: () => projectVersion.toString(),
		getScriptFileNames: () => rootFiles,
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
		getCancellationToken: () => tsToken,
		getCompilationSettings: () => parsedCommandLine.options,
		getLocalizedDiagnosticMessages: context.workspaces.tsLocalized ? () => context.workspaces.tsLocalized : undefined,
		getProjectReferences: () => parsedCommandLine.projectReferences,
	};
	const docChangeWatcher = context.workspaces.documents.onDidChangeContent(() => {
		projectVersion++;
		token = context.server.runtimeEnv.getCancellationToken();
	});
	const fileWatch = serviceEnv.onDidChangeWatchedFiles?.(params => {
		onWorkspaceFilesChanged(params.changes);
	});
	const config = await getConfig(context, plugins, serviceEnv);

	await syncRootScriptSnapshots();

	return {
		askedFiles,
		serviceEnv,
		getLanguageService,
		getLanguageServiceDontCreate: () => languageService,
		tryAddFile: (fileName: string) => {
			if (!rootFiles.includes(fileName)) {
				rootFiles.push(fileName);
				projectVersion++;
				token = context.server.runtimeEnv.getCancellationToken();
			}
		},
		dispose,
		getParsedCommandLine: () => parsedCommandLine,
	};

	async function getRootFiles() {
		parsedCommandLine = await createParsedCommandLine(
			context.workspaces.ts,
			serviceEnv,
			uriToFileName(serviceEnv.workspaceFolder.uri.toString()),
			tsconfig,
			plugins,
		);
		return parsedCommandLine.fileNames;
	}
	function getLanguageService() {
		if (!languageService) {
			languageService = createLanguageService(
				{ typescript: context.workspaces.ts },
				Object.values(config.services ?? {}),
				serviceEnv,
				createTypeScriptProject(
					typescriptProjectHost,
					Object.values(config.languages ?? {}),
					fileName => context.workspaces.documents.data.pathGet(fileName)?.languageId ?? resolveCommonLanguageId(fileName),
				),
			);
		}
		return languageService;
	}
	async function syncRootScriptSnapshots() {
		const promises: Promise<void>[] = [];
		let dirty = false;
		for (const fileName of rootFiles) {
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
			rootFiles = await getRootFiles();
			if (await syncRootScriptSnapshots()) {
				projectVersion++;
			}
		}

		await Promise.all(changes.map(async change => {
			if (askedFiles.uriGet(change.uri) && globalSnapshots.get(fs)!.uriGet(change.uri)) {
				if (change.type === vscode.FileChangeType.Changed) {
					await updateRootScriptSnapshot(change.uri);
				}
				else if (change.type === vscode.FileChangeType.Deleted) {
					globalSnapshots.get(fs)!.uriSet(change.uri, undefined);
				}
				projectVersion++;
			}
		}));

		if (oldProjectVersion !== projectVersion) {
			token = context.server.runtimeEnv.getCancellationToken();
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
	workspacePath: string,
	tsconfig: string | ts.CompilerOptions,
	plugins: ReturnType<TypeScriptServerPlugin>[],
): Promise<ts.ParsedCommandLine> {
	const extraFileExtensions = plugins.map(plugin => plugin.extraFileExtensions ?? []).flat();
	if (ts) {
		const sys = createSys(ts, {
			...env,
			onDidChangeWatchedFiles: undefined,
		}, workspacePath);
		let content: ts.ParsedCommandLine | undefined;
		let sysVersion: number | undefined;
		let newSysVersion = await sys.sync();
		while (sysVersion !== newSysVersion) {
			sysVersion = newSysVersion;
			try {
				if (typeof tsconfig === 'string') {
					const config = ts.readJsonConfigFile(tsconfig, sys.readFile);
					content = ts.parseJsonSourceFileConfigFileContent(config, sys, path.dirname(tsconfig), {}, tsconfig, undefined, extraFileExtensions);
				}
				else {
					content = ts.parseJsonConfigFileContent({ files: [] }, sys, workspacePath, tsconfig, workspacePath + '/jsconfig.json', undefined, extraFileExtensions);
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
