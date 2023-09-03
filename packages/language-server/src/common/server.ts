import { Config, FileSystem, standardSemanticTokensLegend } from '@volar/language-service';
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { InitializationOptions, LanguageServerPlugin, RuntimeEnvironment, ServerMode } from '../types';
import { createCancellationTokenHost } from './cancellationPipe';
import { createConfigurationHost } from './configurationHost';
import { createDocuments } from './documents';
import { setupCapabilities } from './utils/registerFeatures';
import { loadConfig } from './utils/serverConfig';
import { createWorkspaces } from './workspaces';
import { configure as configureHttpRequests } from 'request-light';

export interface ServerContext {
	server: {
		initializeParams: vscode.InitializeParams;
		connection: vscode.Connection;
		runtimeEnv: RuntimeEnvironment;
		plugins: LanguageServerPlugin[];
		onDidChangeWatchedFiles: vscode.Connection['onDidChangeWatchedFiles'];
		configurationHost: ReturnType<typeof createConfigurationHost> | undefined;
	};
}

export function startCommonLanguageServer(connection: vscode.Connection, _plugins: LanguageServerPlugin[], getRuntimeEnv: (params: vscode.InitializeParams, options: InitializationOptions) => RuntimeEnvironment) {

	let initParams: vscode.InitializeParams;
	let options: InitializationOptions;
	let roots: URI[] = [];
	let workspaces: ReturnType<typeof createWorkspaces> | undefined;
	let plugins: ReturnType<LanguageServerPlugin>[];
	let documents: ReturnType<typeof createDocuments>;
	let context: ServerContext;

	const didChangeWatchedFilesCallbacks = new Set<vscode.NotificationHandler<vscode.DidChangeWatchedFilesParams>>();

	connection.onInitialize(async _params => {

		initParams = _params;
		options = initParams.initializationOptions;
		const env = getRuntimeEnv(initParams, options);
		context = {
			server: {
				initializeParams: initParams,
				connection,
				runtimeEnv: {
					...env,
					fs: createFsWithCache(env.fs),
				},
				plugins: _plugins,
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
		plugins = context.server.plugins.map(plugin => plugin(options, {
			typescript: options.typescript ? context.server.runtimeEnv.loadTypescript(options.typescript.tsdk) : undefined
		}));
		documents = createDocuments(context.server.runtimeEnv, connection);

		if (options.l10n) {
			await l10n.config({ uri: options.l10n.location });
		}

		if (initParams.capabilities.workspace?.workspaceFolders && initParams.workspaceFolders) {
			roots = initParams.workspaceFolders.map(folder => URI.parse(folder.uri));
		}
		else if (initParams.rootUri) {
			roots = [URI.parse(initParams.rootUri)];
		}
		else if (initParams.rootPath) {
			roots = [URI.file(initParams.rootPath)];
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

		let config: Config = {};

		for (const root of roots) {
			if (root.scheme === 'file') {
				const workspaceConfig = loadConfig(env.console, root.path, options.configFilePath);
				if (workspaceConfig) {
					config = workspaceConfig;
					break;
				}
			}
		}

		for (const plugin of plugins) {
			if (plugin.resolveConfig) {
				config = await plugin.resolveConfig(config, undefined);
			}
		}

		setupCapabilities(
			result.capabilities,
			options,
			plugins,
			getSemanticTokensLegend(),
			config.services ?? {},
		);

		await createLanguageServiceHost();

		try {
			// show version on LSP logs
			const packageJson = require('../package.json');
			result.serverInfo = {
				name: packageJson.name,
				version: packageJson.version,
			};
		} catch { }

		return result;
	});
	connection.onInitialized(async () => {

		context.server.configurationHost?.ready();
		context.server.configurationHost?.onDidChangeConfiguration?.(updateHttpSettings);

		updateHttpSettings();

		if (initParams.capabilities.workspace?.workspaceFolders) {
			connection.workspace.onDidChangeWorkspaceFolders(e => {

				for (const folder of e.added) {
					workspaces?.add(URI.parse(folder.uri));
				}

				for (const folder of e.removed) {
					workspaces?.remove(URI.parse(folder.uri));
				}
			});
		}

		if (
			options.serverMode !== ServerMode.Syntactic
			&& initParams.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration
		) {
			const exts = plugins.map(plugin => plugin.watchFileExtensions).flat();
			if (exts.length) {
				connection.client.register(vscode.DidChangeWatchedFilesNotification.type, {
					watchers: [
						{
							globPattern: `**/*.{${exts.join(',')}}`
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
	});
	connection.onShutdown(async () => {
		workspaces?.reloadProjects();
	});
	connection.listen();

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

	async function createLanguageServiceHost() {

		const ts = options.typescript ? context.server.runtimeEnv.loadTypescript(options.typescript.tsdk) : undefined;
		const tsLocalized = options.typescript && initParams.locale ? await context.server.runtimeEnv.loadTypescriptLocalized(options.typescript.tsdk, initParams.locale) : undefined;
		const cancelTokenHost = createCancellationTokenHost(options.cancellationPipeName);

		workspaces = createWorkspaces({
			...context,
			workspaces: {
				ts,
				tsLocalized,
				initParams,
				initOptions: options,
				documents,
				cancelTokenHost,
				plugins,
			},
		}, roots);

		(await import('./features/customFeatures.js')).register(connection, workspaces, context.server.runtimeEnv);
		(await import('./features/languageFeatures.js')).register(
			connection,
			workspaces,
			initParams,
			options,
			cancelTokenHost,
			getSemanticTokensLegend(),
			context.server.runtimeEnv,
			documents,
		);

		for (const plugin of plugins) {
			plugin.onInitialized?.(getLanguageService, context.server.runtimeEnv);
		}

		async function getLanguageService(uri: string) {
			const project = (await workspaces!.getProject(uri))?.project;
			return project?.getLanguageService();
		}
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
}
