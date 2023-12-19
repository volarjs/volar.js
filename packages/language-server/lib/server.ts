import { FileSystem, LanguagePlugin, ServiceEnvironment, ServicePlugin, standardSemanticTokensLegend } from '@volar/language-service';
import * as l10n from '@vscode/l10n';
import { configure as configureHttpRequests } from 'request-light';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { DiagnosticModel, InitializationOptions, ProjectContext, ServerProjectProvider, ServerRuntimeEnvironment } from './types.js';
import { createConfigurationHost } from './configurationHost.js';
import { setupCapabilities } from './setupCapabilities.js';
import { createWorkspaceFolderManager } from './workspaceFolderManager.js';
import type { WorkspacesContext } from './project/simpleProjectProvider.js';
import { SnapshotDocument } from '@volar/snapshot-document';

export interface ServerContext {
	server: {
		initializeParams: vscode.InitializeParams;
		connection: vscode.Connection;
		runtimeEnv: ServerRuntimeEnvironment;
		onDidChangeWatchedFiles: vscode.Connection['onDidChangeWatchedFiles'];
		configurationHost: ReturnType<typeof createConfigurationHost> | undefined;
	};
}

export interface ServerSetup {
	servicePlugins: ServicePlugin[];
}

export interface ProjectSetup {
	servicePlugins: ServicePlugin[];
	languagePlugins: LanguagePlugin[];
}

export interface ServerOptions {
	watchFileExtensions?: string[];
	getServerCapabilitiesSetup(): ServerSetup | Promise<ServerSetup>;
	getProjectSetup(serviceEnv: ServiceEnvironment, projectContext: ProjectContext): ProjectSetup | Promise<ProjectSetup>;
}

export function createServer(
	connection: vscode.Connection,
	getRuntimeEnv: (params: vscode.InitializeParams, options: InitializationOptions) => ServerRuntimeEnvironment,
) {

	let initParams: vscode.InitializeParams;
	let options: InitializationOptions;
	let projects: ServerProjectProvider;
	let context: ServerContext;
	let ts: typeof import('typescript/lib/tsserverlibrary') | undefined;
	let tsLocalized: {} | undefined;
	let env: ServerRuntimeEnvironment;
	let serverOptions: ServerOptions;
	let semanticTokensReq = 0;
	let documentUpdatedReq = 0;

	const documents = new vscode.TextDocuments({
		create(uri, languageId, version, text) {
			return new SnapshotDocument(uri, languageId, version, text);
		},
		update(snapshot, contentChanges, version) {
			snapshot.update(contentChanges, version);
			return snapshot;
		},
	});
	documents.listen(connection);

	const didChangeWatchedFilesCallbacks = new Set<vscode.NotificationHandler<vscode.DidChangeWatchedFilesParams>>();
	const workspaceFolderManager = createWorkspaceFolderManager();

	return {
		initialize,
		initialized,
		shutdown,
		get projects() {
			return projects;
		},
		get env() {
			return env;
		},
		get modules() {
			return {
				typescript: ts,
			};
		}
	};

	async function initialize(
		_params: vscode.InitializeParams,
		projectProviderFactory: (context: WorkspacesContext, serverOptions: ServerOptions) => ServerProjectProvider,
		_serverOptions: ServerOptions,
	) {

		initParams = _params;
		serverOptions = _serverOptions;
		options = initParams.initializationOptions;
		env = getRuntimeEnv(initParams, options);
		context = {
			server: {
				initializeParams: initParams,
				connection,
				runtimeEnv: {
					...env,
					fs: createFsWithCache(env.fs),
				},
				configurationHost: initParams.capabilities.workspace?.configuration ? createConfigurationHost(initParams, connection) : undefined,
				onDidChangeWatchedFiles: cb => {
					didChangeWatchedFilesCallbacks.add(cb);
					return {
						dispose: () => {
							didChangeWatchedFilesCallbacks.delete(cb);
						},
					};
				},
			},
		};
		ts = await context.server.runtimeEnv.loadTypeScript(options);
		tsLocalized = initParams.locale
			? await context.server.runtimeEnv.loadTypeScriptLocalized(options, initParams.locale)
			: undefined;

		if (options.l10n) {
			await l10n.config({ uri: options.l10n.location });
		}

		if (initParams.capabilities.workspace?.workspaceFolders && initParams.workspaceFolders) {
			for (const folder of initParams.workspaceFolders) {
				workspaceFolderManager.add({
					uri: URI.parse(folder.uri),
					name: folder.name,
				});
			}
		}
		else if (initParams.rootUri) {
			workspaceFolderManager.add({
				uri: URI.parse(initParams.rootUri),
				name: '',
			});
		}
		else if (initParams.rootPath) {
			workspaceFolderManager.add({
				uri: URI.file(initParams.rootPath),
				name: '',
			});
		}

		const result: vscode.InitializeResult = {
			capabilities: {
				textDocumentSync: vscode.TextDocumentSyncKind.Incremental,
				workspace: {
					// #18
					workspaceFolders: {
						supported: true,
						changeNotifications: true,
					},
				},
			},
		};

		setupCapabilities(
			result.capabilities,
			options,
			serverOptions.watchFileExtensions ?? [],
			(await serverOptions.getServerCapabilitiesSetup()).servicePlugins,
			getSemanticTokensLegend(),
		);

		projects = projectProviderFactory({
			...context,
			workspaces: {
				ts,
				tsLocalized,
				initOptions: options,
				documents,
				workspaceFolders: workspaceFolderManager,
				reloadDiagnostics,
				updateDiagnosticsAndSemanticTokens,
			},
		}, serverOptions);

		documents.onDidChangeContent(({ document }) => {
			updateDiagnostics(document.uri);
		});
		documents.onDidClose(({ document }) => {
			context.server.connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
		});
		context.server.configurationHost?.onDidChangeConfiguration?.(updateDiagnosticsAndSemanticTokens);

		(await import('./register/registerEditorFeatures.js')).registerEditorFeatures(connection, projects, context.server.runtimeEnv);
		(await import('./register/registerLanguageFeatures.js')).registerLanguageFeatures(
			connection,
			projects,
			initParams,
			options,
			getSemanticTokensLegend(),
			context.server.runtimeEnv,
			documents,
		);

		try {
			// show version on LSP logs
			const packageJson = require('../package.json');
			result.serverInfo = {
				name: packageJson.name,
				version: packageJson.version,
			};
		} catch { }

		return result;
	}

	function initialized() {

		context.server.configurationHost?.ready();
		context.server.configurationHost?.onDidChangeConfiguration?.(updateHttpSettings);

		updateHttpSettings();

		if (initParams.capabilities.workspace?.workspaceFolders) {
			connection.workspace.onDidChangeWorkspaceFolders(e => {

				for (const folder of e.added) {
					workspaceFolderManager.add({
						name: folder.name,
						uri: URI.parse(folder.uri),
					});
				}

				for (const folder of e.removed) {
					workspaceFolderManager.remove({
						name: folder.name,
						uri: URI.parse(folder.uri),
					});
				}
			});
		}

		if (initParams.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration) {
			if (serverOptions.watchFileExtensions?.length) {
				connection.client.register(vscode.DidChangeWatchedFilesNotification.type, {
					watchers: [
						{
							globPattern: `**/*.{${serverOptions.watchFileExtensions.join(',')}}`
						},
					]
				});
				connection.onDidChangeWatchedFiles(e => {
					for (const cb of didChangeWatchedFilesCallbacks) {
						cb(e);
					}
				});
			}
		}

		async function updateHttpSettings() {
			const httpSettings = await context.server.configurationHost?.getConfiguration?.<{ proxyStrictSSL: boolean; proxy: string; }>('http');
			configureHttpRequests(httpSettings?.proxy, httpSettings?.proxyStrictSSL ?? false);
		}
	}

	function shutdown() {
		projects?.reloadProjects();
	}

	function createFsWithCache(fs: FileSystem): FileSystem {

		const readFileCache = new Map<string, ReturnType<FileSystem['readFile']>>();
		const statCache = new Map<string, ReturnType<FileSystem['stat']>>();
		const readDirectoryCache = new Map<string, ReturnType<FileSystem['readDirectory']>>();

		didChangeWatchedFilesCallbacks.add(({ changes }) => {
			for (const change of changes) {
				if (change.type === vscode.FileChangeType.Deleted) {
					readFileCache.set(change.uri, undefined);
					statCache.set(change.uri, undefined);
					const dir = change.uri.substring(0, change.uri.lastIndexOf('/'));
					readDirectoryCache.delete(dir);
				}
				else if (change.type === vscode.FileChangeType.Changed) {
					readFileCache.delete(change.uri);
					statCache.delete(change.uri);
				}
				else if (change.type === vscode.FileChangeType.Created) {
					readFileCache.delete(change.uri);
					statCache.delete(change.uri);
					const dir = change.uri.substring(0, change.uri.lastIndexOf('/'));
					readDirectoryCache.delete(dir);
				}
			}
		});

		return {
			readFile: uri => {
				if (!readFileCache.has(uri)) {
					readFileCache.set(uri, fs.readFile(uri));
				}
				return readFileCache.get(uri)!;
			},
			stat: uri => {
				if (!statCache.has(uri)) {
					statCache.set(uri, fs.stat(uri));
				}
				return statCache.get(uri)!;
			},
			readDirectory: uri => {
				if (!readDirectoryCache.has(uri)) {
					readDirectoryCache.set(uri, fs.readDirectory(uri));
				}
				return readDirectoryCache.get(uri)!;
			},
		};
	}

	function getSemanticTokensLegend() {
		if (!options.semanticTokensLegend) {
			return standardSemanticTokensLegend;
		}
		return {
			tokenTypes: [...standardSemanticTokensLegend.tokenTypes, ...options.semanticTokensLegend.tokenTypes],
			tokenModifiers: [...standardSemanticTokensLegend.tokenModifiers, ...options.semanticTokensLegend.tokenModifiers],
		};
	}

	function reloadDiagnostics() {
		for (const document of documents.all()) {
			context.server.connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
		}
		updateDiagnosticsAndSemanticTokens();
	}

	async function updateDiagnosticsAndSemanticTokens() {

		const req = ++semanticTokensReq;

		await updateDiagnostics();

		const delay = 250;
		await sleep(delay);

		if (req === semanticTokensReq) {
			if (context.server.initializeParams.capabilities.workspace?.semanticTokens?.refreshSupport) {
				context.server.connection.languages.semanticTokens.refresh();
			}
			if (context.server.initializeParams.capabilities.workspace?.inlayHint?.refreshSupport) {
				context.server.connection.languages.inlayHint.refresh();
			}
			if ((options.diagnosticModel ?? DiagnosticModel.Push) === DiagnosticModel.Pull) {
				if (context.server.initializeParams.capabilities.workspace?.diagnostics?.refreshSupport) {
					context.server.connection.languages.diagnostics.refresh();
				}
			}
		}
	}

	async function updateDiagnostics(docUri?: string) {

		if ((options.diagnosticModel ?? DiagnosticModel.Push) !== DiagnosticModel.Push)
			return;

		const req = ++documentUpdatedReq;
		const delay = 250;
		const token: vscode.CancellationToken = {
			get isCancellationRequested() {
				return req !== documentUpdatedReq;
			},
			onCancellationRequested: vscode.Event.None,
		};
		const changeDoc = docUri ? documents.get(docUri) : undefined;
		const otherDocs = [...documents.all()].filter(doc => doc !== changeDoc);

		if (changeDoc) {
			await sleep(delay);
			if (token.isCancellationRequested) {
				return;
			}
			await sendDocumentDiagnostics(changeDoc.uri, changeDoc.version, token);
		}

		for (const doc of otherDocs) {
			await sleep(delay);
			if (token.isCancellationRequested) {
				break;
			}
			await sendDocumentDiagnostics(doc.uri, doc.version, token);
		}
	}

	async function sendDocumentDiagnostics(uri: string, version: number, cancel: vscode.CancellationToken) {

		const languageService = (await projects!.getProject(uri)).getLanguageService();
		const errors = await languageService.doValidation(uri, cancel, result => {
			context.server.connection.sendDiagnostics({ uri: uri, diagnostics: result, version });
		});

		context.server.connection.sendDiagnostics({ uri: uri, diagnostics: errors, version });
	}
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
