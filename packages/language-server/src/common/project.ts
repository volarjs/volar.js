import * as embedded from '@volar/language-core';
import * as embeddedLS from '@volar/language-service';
import { LanguageServiceOptions } from '@volar/language-service';
import * as path from 'typesafe-path';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as html from 'vscode-html-languageservice';
import * as vscode from 'vscode-languageserver';
import { URI, Utils } from 'vscode-uri';
import { FileSystem, LanguageServerPlugin, LanguageServiceContext, ServerMode } from '../types';
import { loadConfig } from './utils/serverConfig';
import { createUriMap } from './utils/uriMap';
import { WorkspaceContext } from './workspace';

export interface ProjectContext {
	workspace: WorkspaceContext;
	rootUri: URI;
	tsConfig: path.PosixPath | ts.CompilerOptions,
	documentRegistry: ts.DocumentRegistry | undefined,
}

export type Project = ReturnType<typeof createProject>;

export async function createProject(context: ProjectContext) {

	const uriToFileName = context.workspace.workspaces.server.runtimeEnv.uriToFileName;
	const fileNameToUri = context.workspace.workspaces.server.runtimeEnv.fileNameToUri;

	const sys: FileSystem = context.workspace.workspaces.initOptions.serverMode === ServerMode.Syntactic || !context.workspace.workspaces.fileSystemHost
		? {
			newLine: '\n',
			useCaseSensitiveFileNames: false,
			fileExists: () => false,
			readFile: () => undefined,
			readDirectory: () => [],
			getCurrentDirectory: () => '',
			realpath: () => '',
			resolvePath: () => '',
		}
		: context.workspace.workspaces.fileSystemHost.getWorkspaceFileSystem(context.rootUri);

	let typeRootVersion = 0;
	let projectVersion = 0;
	let projectVersionUpdateTime = context.workspace.workspaces.cancelTokenHost.getMtime();
	let languageService: embeddedLS.LanguageService | undefined;
	let parsedCommandLine = createParsedCommandLine(
		context.workspace.workspaces.ts,
		sys,
		uriToFileName(context.rootUri.toString()) as path.PosixPath,
		context.tsConfig,
		context.workspace.workspaces.plugins,
	);

	const scripts = createUriMap<{
		version: number,
		fileName: string,
		snapshot: ts.IScriptSnapshot | undefined,
		snapshotVersion: number | undefined,
	}>(fileNameToUri);
	const languageServiceHost = createLanguageServiceHost();
	const disposeWatchEvent = context.workspace.workspaces.fileSystemHost?.onDidChangeWatchedFiles(params => {
		onWorkspaceFilesChanged(params.changes);
	});
	const disposeDocChange = context.workspace.workspaces.documents.onDidChangeContent(() => {
		projectVersion++;
		projectVersionUpdateTime = context.workspace.workspaces.cancelTokenHost.getMtime();
	});

	return {
		tsConfig: context.tsConfig,
		scripts,
		languageServiceHost,
		getLanguageService,
		getLanguageServiceDontCreate: () => languageService,
		getParsedCommandLine: () => parsedCommandLine,
		tryAddFile: (fileName: string) => {
			if (!parsedCommandLine.fileNames.includes(fileName)) {
				parsedCommandLine.fileNames.push(fileName);
				projectVersion++;
				projectVersionUpdateTime = context.workspace.workspaces.cancelTokenHost.getMtime();
			}
		},
		dispose,
	};

	function getLanguageService() {
		if (!languageService) {
			let config = (
				context.workspace.rootUri.scheme === 'file' ? loadConfig(
					context.workspace.rootUri.path,
					context.workspace.workspaces.initOptions.configFilePath,
				) : {}
			) ?? {};
			const options: LanguageServiceOptions = {
				uriToFileName,
				fileNameToUri,
				locale: context.workspace.workspaces.initParams.locale,
				rootUri: context.rootUri,
				capabilities: context.workspace.workspaces.initParams.capabilities,
				host: languageServiceHost,
				get config() {
					return config;
				},
				configurationHost: context.workspace.workspaces.configurationHost,
				fileSystemProvider: context.workspace.workspaces.server.runtimeEnv.fileSystemProvide,
				documentContext: getDocumentContext(fileNameToUri, uriToFileName, context.workspace.workspaces.ts, languageServiceHost, context.rootUri.toString()),
				schemaRequestService: async uri => {
					const protocol = uri.substring(0, uri.indexOf(':'));
					const builtInHandler = context.workspace.workspaces.server.runtimeEnv.schemaRequestHandlers[protocol];
					if (builtInHandler) {
						return await builtInHandler(uri) ?? '';
					}
					return '';
				},
			};
			const lsCtx: LanguageServiceContext = {
				project: context,
				options,
				sys,
				host: languageServiceHost,
			};
			for (const plugin of context.workspace.workspaces.plugins) {
				if (plugin.resolveConfig) {
					config = plugin.resolveConfig(config, { typescript: lsCtx.project.workspace.workspaces.ts }, lsCtx);
				}
			}
			languageService = embeddedLS.createLanguageService(options, context.documentRegistry);
		}
		return languageService;
	}
	async function onWorkspaceFilesChanged(changes: vscode.FileEvent[]) {

		const _projectVersion = projectVersion;

		for (const change of changes) {

			const script = scripts.uriGet(change.uri);

			if (script && (change.type === vscode.FileChangeType.Changed || change.type === vscode.FileChangeType.Created)) {
				if (script.version >= 0) {
					script.version = -1;
				}
				else {
					script.version--;
				}
			}
			else if (script && change.type === vscode.FileChangeType.Deleted) {
				scripts.uriDelete(change.uri);
			}

			if (
				script
				|| change.uri.endsWith('.d.ts')
				|| change.uri.endsWith('/package.json')
			) {
				projectVersion++;
			}
		}

		const creates = changes.filter(change => change.type === vscode.FileChangeType.Created);
		const deletes = changes.filter(change => change.type === vscode.FileChangeType.Deleted);

		if (creates.length || deletes.length) {
			parsedCommandLine = createParsedCommandLine(context.workspace.workspaces.ts, sys, uriToFileName(context.rootUri.toString()) as path.PosixPath, context.tsConfig, context.workspace.workspaces.plugins);
			projectVersion++;
			typeRootVersion++;
		}

		if (_projectVersion !== projectVersion) {
			projectVersionUpdateTime = context.workspace.workspaces.cancelTokenHost.getMtime();
		}
	}
	function createLanguageServiceHost() {

		const token: ts.CancellationToken = {
			isCancellationRequested() {
				return context.workspace.workspaces.cancelTokenHost.getMtime() !== projectVersionUpdateTime;
			},
			throwIfCancellationRequested() { },
		};
		let host: embedded.LanguageServiceHost = {
			// ts
			getNewLine: () => sys.newLine,
			useCaseSensitiveFileNames: () => sys.useCaseSensitiveFileNames,
			readFile: sys.readFile,
			writeFile: sys.writeFile,
			directoryExists: sys.directoryExists,
			getDirectories: sys.getDirectories,
			readDirectory: sys.readDirectory,
			realpath: sys.realpath,
			fileExists: sys.fileExists,
			getCurrentDirectory: () => uriToFileName(context.rootUri.toString()),
			getProjectReferences: () => parsedCommandLine.projectReferences, // if circular, broken with provide `getParsedCommandLine: () => parsedCommandLine`
			getCancellationToken: () => token,
			// custom
			getDefaultLibFileName: options => {
				if (context.workspace.workspaces.initOptions.typescript && context.workspace.workspaces.ts) {
					try {
						return context.workspace.workspaces.ts.getDefaultLibFilePath(options);
					} catch {
						// web
						const tsdk = context.workspace.workspaces.initOptions.typescript.tsdk;
						return tsdk + '/' + context.workspace.workspaces.ts.getDefaultLibFileName(options);
					}
				}
				return '';
			},
			getProjectVersion: () => projectVersion.toString(),
			getTypeRootsVersion: () => typeRootVersion,
			getScriptFileNames: () => parsedCommandLine.fileNames,
			getCompilationSettings: () => parsedCommandLine.options,
			getScriptVersion,
			getScriptSnapshot,
			getTypeScriptModule: context.workspace.workspaces.ts ? () => {
				return context.workspace.workspaces.ts!;
			} : undefined,
			getScriptLanguageId: (fileName) => {
				return context.workspace.workspaces.documents.data.pathGet(fileName)?.languageId;
			},
		};

		if (context.workspace.workspaces.initOptions.noProjectReferences) {
			host.getProjectReferences = undefined;
			host.getCompilationSettings = () => ({
				...parsedCommandLine.options,
				rootDir: undefined,
				composite: false,
			});
		}

		if (context.workspace.workspaces.tsLocalized) {
			host.getLocalizedDiagnosticMessages = () => context.workspace.workspaces.tsLocalized;
		}

		return host;

		function getScriptVersion(fileName: string) {

			const doc = context.workspace.workspaces.documents.data.pathGet(fileName);
			if (doc) {
				return doc.version.toString();
			}

			return scripts.pathGet(fileName)?.version.toString() ?? '';
		}
		function getScriptSnapshot(fileName: string) {

			const doc = context.workspace.workspaces.documents.data.pathGet(fileName);
			if (doc) {
				return doc.getSnapshot();
			}

			const script = scripts.pathGet(fileName);
			if (script && script.snapshotVersion === script.version) {
				return script.snapshot;
			}

			if (context.workspace.workspaces.ts && sys.fileExists(fileName)) {
				if (context.workspace.workspaces.initOptions.maxFileSize) {
					const fileSize = sys.getFileSize?.(fileName);
					if (fileSize !== undefined && fileSize > context.workspace.workspaces.initOptions.maxFileSize) {
						console.warn(`IGNORING "${fileName}" because it is too large (${fileSize}bytes > ${context.workspace.workspaces.initOptions.maxFileSize}bytes)`);
						return context.workspace.workspaces.ts.ScriptSnapshot.fromString('');
					}
				}
				const text = sys.readFile(fileName, 'utf8');
				if (text !== undefined) {
					const snapshot = context.workspace.workspaces.ts.ScriptSnapshot.fromString(text);
					if (script) {
						script.snapshot = snapshot;
						script.snapshotVersion = script.version;
					}
					else {
						scripts.pathSet(fileName, {
							version: -1,
							fileName: fileName,
							snapshot: snapshot,
							snapshotVersion: -1,
						});
					}
					return snapshot;
				}
			}
		}
	}
	function dispose() {
		languageService?.dispose();
		scripts.clear();
		disposeWatchEvent?.();
		disposeDocChange();
	}
}

function createParsedCommandLine(
	ts: typeof import('typescript/lib/tsserverlibrary') | undefined,
	sys: FileSystem,
	rootPath: path.PosixPath,
	tsConfig: path.PosixPath | ts.CompilerOptions,
	plugins: ReturnType<LanguageServerPlugin>[],
): ts.ParsedCommandLine {
	const extraFileExtensions = plugins.map(plugin => plugin.extraFileExtensions ?? []).flat();
	if (ts) {
		try {
			let content: ts.ParsedCommandLine;
			if (typeof tsConfig === 'string') {
				const config = ts.readJsonConfigFile(tsConfig, sys.readFile);
				content = ts.parseJsonSourceFileConfigFileContent(config, sys, path.dirname(tsConfig), {}, tsConfig, undefined, extraFileExtensions);
			}
			else {
				content = ts.parseJsonConfigFileContent({ files: [] }, sys, rootPath, tsConfig, path.join(rootPath, 'jsconfig.json' as path.PosixPath), undefined, extraFileExtensions);
			}
			// fix https://github.com/johnsoncodehk/volar/issues/1786
			// https://github.com/microsoft/TypeScript/issues/30457
			// patching ts server broke with outDir + rootDir + composite/incremental
			content.options.outDir = undefined;
			content.fileNames = content.fileNames.map(fileName => fileName.replace(/\\/g, '/'));
			return content;
		}
		catch {
			// will be failed if web fs host first result not ready
		}
	}
	return {
		errors: [],
		fileNames: [],
		options: {},
	};
}

function getDocumentContext(
	fileNameToUri: LanguageServiceOptions['fileNameToUri'],
	uriToFileName: LanguageServiceOptions['uriToFileName'],
	ts: typeof import('typescript/lib/tsserverlibrary') | undefined,
	host: ts.LanguageServiceHost | undefined,
	rootUri: string,
) {
	const documentContext: html.DocumentContext = {
		resolveReference: (ref: string, base) => {

			if (ts && host) { // support tsconfig.json paths

				const isUri = base.indexOf('://') >= 0;
				const resolveResult = ts.resolveModuleName(
					ref,
					isUri ? uriToFileName(base) : base,
					host.getCompilationSettings(),
					host,
				);
				const failedLookupLocations: path.PosixPath[] | undefined = typeof resolveResult === 'object' ? (resolveResult as any).failedLookupLocations : [];
				const dirs = new Set<string>();

				if (!failedLookupLocations) {
					console.warn(`[volar] failedLookupLocations not exists, ts: ${ts.version}`);
				}

				for (let failed of failedLookupLocations ?? []) {
					const fileName = path.basename(failed);
					if (fileName === 'index.d.ts' || fileName === '*.d.ts') {
						dirs.add(path.dirname(failed));
					}
					if (failed.endsWith('.d.ts')) {
						failed = failed.substring(0, failed.length - '.d.ts'.length) as path.PosixPath;
					}
					else {
						continue;
					}
					if (host.fileExists(failed)) {
						return isUri ? fileNameToUri(failed) : failed;
					}
				}
				for (const dir of dirs) {
					if (host.directoryExists?.(dir) ?? true) {
						return isUri ? fileNameToUri(dir) : dir;
					}
				}
			}

			// original html resolveReference

			if (ref.match(/^\w[\w\d+.-]*:/)) {
				// starts with a schema
				return ref;
			}
			if (ref[0] === '/') { // resolve absolute path against the current workspace folder
				const folderUri = rootUri;
				if (folderUri) {
					return folderUri + ref.substr(1);
				}
			}
			const baseUri = URI.parse(base);
			const baseUriDir = baseUri.path.endsWith('/') ? baseUri : Utils.dirname(baseUri);
			return Utils.resolvePath(baseUriDir, ref).toString(true);
		},
	};
	return documentContext;
}
