import { Config, standardSemanticTokensLegend } from '@volar/language-service';
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { FileSystemHost, InitializationOptions, LanguageServerPlugin, RuntimeEnvironment, ServerMode } from '../types';
import { createCancellationTokenHost } from './cancellationPipe';
import { createConfigurationHost } from './configurationHost';
import { createDocuments } from './documents';
import { setupCapabilities } from './utils/registerFeatures';
import { loadConfig } from './utils/serverConfig';
import { createWorkspaces } from './workspaces';

export interface ServerContext {
	server: {
		connection: vscode.Connection;
		runtimeEnv: RuntimeEnvironment;
		plugins: LanguageServerPlugin[];
	};
}

export function startCommonLanguageServer(connection: vscode.Connection, getCtx: (initOptions: InitializationOptions) => ServerContext['server']) {

	let initParams: vscode.InitializeParams;
	let options: InitializationOptions;
	let roots: URI[] = [];
	let fsHost: FileSystemHost | undefined;
	let projects: ReturnType<typeof createWorkspaces> | undefined;
	let configurationHost: ReturnType<typeof createConfigurationHost> | undefined;
	let plugins: ReturnType<LanguageServerPlugin>[];
	let documents: ReturnType<typeof createDocuments>;
	let context: ServerContext;

	connection.onInitialize(async _params => {

		initParams = _params;
		options = initParams.initializationOptions;
		context = { server: getCtx(options) };
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

		configurationHost = initParams.capabilities.workspace?.configuration ? createConfigurationHost(initParams, connection) : undefined;

		let services: Config['services'] = {};
		for (const root of roots) {
			if (root.scheme === 'file') {
				let config = loadConfig(root.path, options.configFilePath) ?? {};
				for (const plugin of plugins) {
					if (plugin.resolveConfig) {
						config = plugin.resolveConfig(config, undefined);
					}
				}
				if (config.services) {
					services = {
						...services,
						...config.services,
					};
				}
			}
		}

		setupCapabilities(
			result.capabilities,
			options,
			plugins,
			getSemanticTokensLegend(),
			services,
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
	connection.onInitialized(() => {

		fsHost?.ready(connection);
		configurationHost?.ready();

		if (initParams.capabilities.workspace?.workspaceFolders) {
			connection.workspace.onDidChangeWorkspaceFolders(e => {

				for (const folder of e.added) {
					projects?.add(URI.parse(folder.uri));
				}

				for (const folder of e.removed) {
					projects?.remove(URI.parse(folder.uri));
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
			}
		}
	});
	connection.onShutdown(async () => {
		if (projects) {
			for (const workspace of projects.workspaces) {
				(await workspace[1]).dispose();
			}
		}
	});
	connection.listen();

	async function createLanguageServiceHost() {

		const ts = options.typescript ? context.server.runtimeEnv.loadTypescript(options.typescript.tsdk) : undefined;
		fsHost = ts ? context.server.runtimeEnv.createFileSystemHost(ts, initParams.capabilities, context.server.runtimeEnv, options) : undefined;

		const tsLocalized = options.typescript && initParams.locale ? await context.server.runtimeEnv.loadTypescriptLocalized(options.typescript.tsdk, initParams.locale) : undefined;
		const cancelTokenHost = createCancellationTokenHost(options.cancellationPipeName);

		projects = createWorkspaces({
			...context,
			workspaces: {
				fileSystemHost: fsHost,
				configurationHost,
				ts,
				tsLocalized,
				initParams,
				initOptions: options,
				documents,
				cancelTokenHost,
				plugins,
			},
		});

		for (const root of roots) {
			projects.add(root);
		}

		(await import('./features/customFeatures')).register(connection, projects, context.server.runtimeEnv);
		(await import('./features/languageFeatures')).register(
			connection,
			projects,
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
			const project = (await projects!.getProject(uri))?.project;
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
