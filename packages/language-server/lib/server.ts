import { FileSystem, LanguageServicePlugin, standardSemanticTokensLegend } from '@volar/language-service';
import { SnapshotDocument } from '@volar/snapshot-document';
import * as l10n from '@vscode/l10n';
import { configure as configureHttpRequests } from 'request-light';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { getServerCapabilities } from './serverCapabilities.js';
import type { VolarInitializeParams, ServerProjectProvider } from './types.js';
import { fileNameToUri } from './uri.js';
import { createUriMap } from './utils/uriMap.js';
import { registerEditorFeatures } from './register/registerEditorFeatures.js';
import { registerLanguageFeatures } from './register/registerLanguageFeatures.js';

export function createServerBase(
	connection: vscode.Connection,
	getFs: (initializeParams: VolarInitializeParams) => FileSystem,
) {
	let semanticTokensReq = 0;
	let documentUpdatedReq = 0;

	const didChangeWatchedFilesCallbacks = new Set<vscode.NotificationHandler<vscode.DidChangeWatchedFilesParams>>();
	const didChangeConfigurationCallbacks = new Set<vscode.NotificationHandler<vscode.DidChangeConfigurationParams>>();
	const workspaceFolders = createUriMap<boolean>(fileNameToUri);
	const configurations = new Map<string, Promise<any>>();
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

	const status = {
		connection,
		initializeParams: undefined as unknown as VolarInitializeParams,
		languageServicePlugins: [] as unknown as LanguageServicePlugin[],
		projects: undefined as unknown as ServerProjectProvider,
		fs: undefined as unknown as FileSystem,
		semanticTokensLegend: undefined as unknown as vscode.SemanticTokensLegend,
		pullModelDiagnostics: false,
		documents,
		workspaceFolders,
		initialize,
		initialized,
		shutdown,
		watchFiles,
		getConfiguration,
		onDidChangeConfiguration,
		onDidChangeWatchedFiles,
		clearPushDiagnostics,
		refresh,
	};
	return status;

	function initialize(
		initializeParams: VolarInitializeParams,
		languageServicePlugins: LanguageServicePlugin[],
		projects: ServerProjectProvider,
		options?: {
			semanticTokensLegend?: vscode.SemanticTokensLegend;
			pullModelDiagnostics?: boolean;
		},
	) {
		status.initializeParams = initializeParams;
		status.languageServicePlugins = languageServicePlugins;
		status.projects = projects;
		status.semanticTokensLegend = options?.semanticTokensLegend ?? standardSemanticTokensLegend;
		status.pullModelDiagnostics = options?.pullModelDiagnostics ?? false;
		status.fs = createFsWithCache(getFs(initializeParams));

		if (initializeParams.initializationOptions?.l10n) {
			l10n.config({ uri: initializeParams.initializationOptions.l10n.location });
		}

		if (initializeParams.workspaceFolders?.length) {
			for (const folder of initializeParams.workspaceFolders) {
				workspaceFolders.uriSet(folder.uri, true);
			}
		}
		else if (initializeParams.rootUri) {
			workspaceFolders.uriSet(initializeParams.rootUri, true);
		}
		else if (initializeParams.rootPath) {
			workspaceFolders.uriSet(URI.file(initializeParams.rootPath).toString(), true);
		}

		const result: vscode.InitializeResult = {
			capabilities: getServerCapabilities(status),
		};

		if (!status.pullModelDiagnostics) {
			result.capabilities.diagnosticProvider = undefined;
			activateServerPushDiagnostics(projects);
		}

		registerEditorFeatures(status);
		registerLanguageFeatures(status);

		return result;
	}

	function initialized() {
		registerWorkspaceFolderWatcher();
		registerConfigurationWatcher();
		updateHttpSettings();
		onDidChangeConfiguration(updateHttpSettings);
	}

	async function shutdown() {
		for (const project of await status.projects.all.call(status)) {
			project.dispose();
		}
	}

	async function updateHttpSettings() {
		const httpSettings = await getConfiguration<{ proxyStrictSSL: boolean; proxy: string; }>('http');
		configureHttpRequests(httpSettings?.proxy, httpSettings?.proxyStrictSSL ?? false);
	}

	function getConfiguration<T>(section: string, scopeUri?: string): Promise<T | undefined> {
		if (!status.initializeParams?.capabilities.workspace?.configuration) {
			return Promise.resolve(undefined);
		}
		if (!scopeUri && status.initializeParams.capabilities.workspace?.didChangeConfiguration) {
			if (!configurations.has(section)) {
				configurations.set(section, getConfigurationWorker(section, scopeUri));
			}
			return configurations.get(section)!;
		}
		return getConfigurationWorker(section, scopeUri);
	}

	async function getConfigurationWorker(section: string, scopeUri?: string) {
		return (await connection.workspace.getConfiguration({ scopeUri, section })) ?? undefined /* replace null to undefined */;
	}

	function onDidChangeConfiguration(cb: vscode.NotificationHandler<vscode.DidChangeConfigurationParams>) {
		didChangeConfigurationCallbacks.add(cb);
		return {
			dispose() {
				didChangeConfigurationCallbacks.delete(cb);
			},
		};
	}

	function onDidChangeWatchedFiles(cb: vscode.NotificationHandler<vscode.DidChangeWatchedFilesParams>) {
		didChangeWatchedFilesCallbacks.add(cb);
		return {
			dispose: () => {
				didChangeWatchedFilesCallbacks.delete(cb);
			},
		};
	}

	function createFsWithCache(fs: FileSystem): FileSystem {

		const readFileCache = new Map<string, ReturnType<FileSystem['readFile']>>();
		const statCache = new Map<string, ReturnType<FileSystem['stat']>>();
		const readDirectoryCache = new Map<string, ReturnType<FileSystem['readDirectory']>>();

		onDidChangeWatchedFiles(({ changes }) => {
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

	function registerConfigurationWatcher() {
		const didChangeConfiguration = status.initializeParams?.capabilities.workspace?.didChangeConfiguration;
		if (didChangeConfiguration) {
			connection.onDidChangeConfiguration(params => {
				configurations.clear();
				for (const cb of didChangeConfigurationCallbacks) {
					cb(params);
				}
			});
			if (didChangeConfiguration.dynamicRegistration) {
				connection.client.register(vscode.DidChangeConfigurationNotification.type);
			}
		}
	}

	function watchFiles(patterns: string[]) {
		const didChangeWatchedFiles = status.initializeParams?.capabilities.workspace?.didChangeWatchedFiles;
		const fileOperations = status.initializeParams?.capabilities.workspace?.fileOperations;
		if (didChangeWatchedFiles) {
			connection.onDidChangeWatchedFiles(e => {
				for (const cb of didChangeWatchedFilesCallbacks) {
					cb(e);
				}
			});
			if (didChangeWatchedFiles.dynamicRegistration) {
				connection.client.register(vscode.DidChangeWatchedFilesNotification.type, {
					watchers: patterns.map(pattern => ({ globPattern: pattern })),
				});
			}
		}
		if (fileOperations?.dynamicRegistration && fileOperations.willRename) {
			connection.client.register(vscode.WillRenameFilesRequest.type, {
				filters: patterns.map(pattern => ({ pattern: { glob: pattern } })),
			});
		}
	}

	function registerWorkspaceFolderWatcher() {
		if (status.initializeParams?.capabilities.workspace?.workspaceFolders) {
			connection.workspace.onDidChangeWorkspaceFolders(e => {
				for (const folder of e.added) {
					workspaceFolders.uriSet(folder.uri, true);
				}
				for (const folder of e.removed) {
					workspaceFolders.uriDelete(folder.uri);
				}
				// projects.reloadProjects();
			});
		}
	}

	function activateServerPushDiagnostics(projects: ServerProjectProvider) {
		documents.onDidChangeContent(({ document }) => {
			pushAllDiagnostics(projects, document.uri);
		});
		documents.onDidClose(({ document }) => {
			connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
		});
		onDidChangeConfiguration(() => refresh(projects));
	}

	function clearPushDiagnostics() {
		if (!status.pullModelDiagnostics) {
			for (const document of documents.all()) {
				connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
			}
		}
	}

	async function refresh(projects: ServerProjectProvider) {

		const req = ++semanticTokensReq;

		if (!status.pullModelDiagnostics) {
			await pushAllDiagnostics(projects);
		}

		const delay = 250;
		await sleep(delay);

		if (req === semanticTokensReq) {
			if (status.initializeParams?.capabilities.workspace?.semanticTokens?.refreshSupport) {
				connection.languages.semanticTokens.refresh();
			}
			if (status.initializeParams?.capabilities.workspace?.inlayHint?.refreshSupport) {
				connection.languages.inlayHint.refresh();
			}
			if (status.pullModelDiagnostics && status.initializeParams?.capabilities.workspace?.diagnostics?.refreshSupport) {
				connection.languages.diagnostics.refresh();
			}
		}
	}

	async function pushAllDiagnostics(projects: ServerProjectProvider, docUri?: string) {
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
			await pushDiagnostics(projects, changeDoc.uri, changeDoc.version, token);
		}

		for (const doc of otherDocs) {
			await sleep(delay);
			if (token.isCancellationRequested) {
				break;
			}
			await pushDiagnostics(projects, doc.uri, doc.version, token);
		}
	}

	async function pushDiagnostics(projects: ServerProjectProvider, uri: string, version: number, cancel: vscode.CancellationToken) {
		const languageService = (await projects.get.call(status, uri)).getLanguageService();
		const errors = await languageService.doValidation(uri, cancel, result => {
			connection.sendDiagnostics({ uri: uri, diagnostics: result, version });
		});

		connection.sendDiagnostics({ uri: uri, diagnostics: errors, version });
	}
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
