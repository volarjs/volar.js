import { FileSystem, LanguagePlugin, ServiceEnvironment, ServicePlugin, standardSemanticTokensLegend } from '@volar/language-service';
import { SnapshotDocument } from '@volar/snapshot-document';
import * as l10n from '@vscode/l10n';
import { configure as configureHttpRequests } from 'request-light';
import type { TextDocuments } from 'vscode-languageserver';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { createConfigurationHost } from './configurationHost.js';
import { getServerCapabilities } from './serverCapabilities.js';
import { DiagnosticModel, InitializationOptions, ProjectContext, ServerProjectProvider, ServerProjectProviderFactory, ServerRuntimeEnvironment } from './types.js';
import { fileNameToUri } from './uri.js';
import { createUriMap, type UriMap } from './utils/uriMap.js';

export interface ServerContext {
	initializeParams: Omit<vscode.InitializeParams, 'initializationOptions'> & { initializationOptions?: InitializationOptions; };
	runtimeEnv: ServerRuntimeEnvironment;
	onDidChangeWatchedFiles: vscode.Connection['onDidChangeWatchedFiles'];
	configurationHost: ReturnType<typeof createConfigurationHost> | undefined;
	workspaceFolders: UriMap<boolean>;
	documents: TextDocuments<SnapshotDocument>;
	reloadDiagnostics(): void;
	updateDiagnosticsAndSemanticTokens(): void;
}

export interface ServerOptions {
	watchFileExtensions?: string[];
	getServicePlugins(): ServicePlugin[] | Promise<ServicePlugin[]>;
	getLanguagePlugins(serviceEnv: ServiceEnvironment, projectContext: ProjectContext): LanguagePlugin[] | Promise<LanguagePlugin[]>;
}

export function createServerBase(
	connection: vscode.Connection,
	getRuntimeEnv: (params: ServerContext['initializeParams']) => ServerRuntimeEnvironment,
) {

	let context: ServerContext;
	let projects: ServerProjectProvider;
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
	const didChangeWatchedFilesCallbacks = new Set<vscode.NotificationHandler<vscode.DidChangeWatchedFilesParams>>();
	const workspaceFolders = createUriMap<boolean>(fileNameToUri);

	documents.listen(connection);

	return {
		initialize,
		initialized,
		shutdown,
		get projects() {
			return projects;
		},
		get env() {
			return context.runtimeEnv;
		},
	};

	async function initialize(
		params: ServerContext['initializeParams'],
		projectProviderFactory: ServerProjectProviderFactory,
		_serverOptions: ServerOptions,
	) {

		serverOptions = _serverOptions;
		const env = getRuntimeEnv(params);
		context = {
			initializeParams: params,
			runtimeEnv: {
				...env,
				fs: createFsWithCache(env.fs),
			},
			configurationHost: params.capabilities.workspace?.configuration
				? createConfigurationHost(params, connection)
				: undefined,
			onDidChangeWatchedFiles: cb => {
				didChangeWatchedFilesCallbacks.add(cb);
				return {
					dispose: () => {
						didChangeWatchedFilesCallbacks.delete(cb);
					},
				};
			},
			documents,
			workspaceFolders,
			reloadDiagnostics,
			updateDiagnosticsAndSemanticTokens,
		};

		if (context.initializeParams.initializationOptions?.l10n) {
			await l10n.config({ uri: context.initializeParams.initializationOptions.l10n.location });
		}

		if (params.capabilities.workspace?.workspaceFolders && params.workspaceFolders) {
			for (const folder of params.workspaceFolders) {
				workspaceFolders.uriSet(folder.uri, true);
			}
		}
		else if (params.rootUri) {
			workspaceFolders.uriSet(params.rootUri, true);
		}
		else if (params.rootPath) {
			workspaceFolders.uriSet(URI.file(params.rootPath).toString(), true);
		}

		const servicePlugins = await serverOptions.getServicePlugins();
		const semanticTokensLegend = getSemanticTokensLegend();

		projects = projectProviderFactory(
			{ ...context },
			servicePlugins,
			serverOptions.getLanguagePlugins,
		);

		documents.onDidChangeContent(({ document }) => {
			updateDiagnostics(document.uri);
		});
		documents.onDidClose(({ document }) => {
			if (!isServerPushEnabled()) {
				return;
			}
			connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
		});
		context.configurationHost?.onDidChangeConfiguration?.(updateDiagnosticsAndSemanticTokens);

		(await import('./register/registerEditorFeatures.js')).registerEditorFeatures(connection, projects);
		(await import('./register/registerLanguageFeatures.js')).registerLanguageFeatures(
			connection,
			projects,
			params,
			semanticTokensLegend,
		);

		const result: vscode.InitializeResult = {
			capabilities: getServerCapabilities(serverOptions.watchFileExtensions ?? [], servicePlugins, semanticTokensLegend),
		};

		if (params.initializationOptions?.diagnosticModel !== DiagnosticModel.Pull) {
			result.capabilities.diagnosticProvider = undefined;
		}

		try {
			const packageJson = require('../package.json');
			result.serverInfo = {
				name: packageJson.name,
				version: packageJson.version,
			};
		} catch { }

		return result;
	}

	function initialized() {

		context.configurationHost?.ready();
		context.configurationHost?.onDidChangeConfiguration?.(updateHttpSettings);

		updateHttpSettings();

		if (context.initializeParams.capabilities.workspace?.workspaceFolders) {
			connection.workspace.onDidChangeWorkspaceFolders(e => {
				for (const folder of e.added) {
					workspaceFolders.uriSet(folder.uri, true);
				}
				for (const folder of e.removed) {
					workspaceFolders.uriDelete(folder.uri);
				}
				projects.reloadProjects();
			});
		}

		if (
			context.initializeParams.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration
			&& serverOptions.watchFileExtensions?.length
		) {
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

		async function updateHttpSettings() {
			const httpSettings = await context.configurationHost?.getConfiguration?.<{ proxyStrictSSL: boolean; proxy: string; }>('http');
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
		return {
			tokenTypes: [
				...standardSemanticTokensLegend.tokenTypes,
				...context.initializeParams.initializationOptions?.semanticTokensLegend?.tokenTypes ?? [],
			],
			tokenModifiers: [
				...standardSemanticTokensLegend.tokenModifiers,
				...context.initializeParams.initializationOptions?.semanticTokensLegend?.tokenModifiers ?? [],
			],
		};
	}

	function reloadDiagnostics() {
		if (!isServerPushEnabled()) {
			return;
		}
		for (const document of documents.all()) {
			connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
		}
		updateDiagnosticsAndSemanticTokens();
	}

	async function updateDiagnosticsAndSemanticTokens() {

		const req = ++semanticTokensReq;

		await updateDiagnostics();

		const delay = 250;
		await sleep(delay);

		if (req === semanticTokensReq) {
			if (context.initializeParams.capabilities.workspace?.semanticTokens?.refreshSupport) {
				connection.languages.semanticTokens.refresh();
			}
			if (context.initializeParams.capabilities.workspace?.inlayHint?.refreshSupport) {
				connection.languages.inlayHint.refresh();
			}
			if (isServerPushEnabled()) {
				if (context.initializeParams.capabilities.workspace?.diagnostics?.refreshSupport) {
					connection.languages.diagnostics.refresh();
				}
			}
		}
	}

	async function updateDiagnostics(docUri?: string) {

		if (!isServerPushEnabled()) {
			return;
		}

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

		const languageService = (await projects.getProject(uri)).getLanguageService();
		const errors = await languageService.doValidation(uri, cancel, result => {
			connection.sendDiagnostics({ uri: uri, diagnostics: result, version });
		});

		connection.sendDiagnostics({ uri: uri, diagnostics: errors, version });
	}

	function isServerPushEnabled() {
		return (context.initializeParams.initializationOptions?.diagnosticModel ?? DiagnosticModel.Push) === DiagnosticModel.Push;
	}
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
