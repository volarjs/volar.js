import { FileSystem, LanguageServicePlugin, createUriMap } from '@volar/language-service';
import { SnapshotDocument } from '@volar/snapshot-document';
import { configure as configureHttpRequests } from 'request-light';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { registerEditorFeatures } from './register/registerEditorFeatures.js';
import { registerLanguageFeatures } from './register/registerLanguageFeatures.js';
import type { ServerProjectProvider } from './types.js';

export * from '@volar/snapshot-document';

export function createServerBase(
	connection: vscode.Connection,
	getFs: (options: vscode.InitializeParams) => FileSystem,
) {
	let semanticTokensReq = 0;
	let documentUpdatedReq = 0;

	const syncedDocumentParsedUriToUri = new Map<string, string>();
	const didChangeWatchedFilesCallbacks = new Set<vscode.NotificationHandler<vscode.DidChangeWatchedFilesParams>>();
	const didChangeConfigurationCallbacks = new Set<vscode.NotificationHandler<vscode.DidChangeConfigurationParams>>();
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
	documents.onDidOpen(({ document }) => {
		const parsedUri = URI.parse(document.uri);
		syncedDocumentParsedUriToUri.set(parsedUri.toString(), document.uri);
	});
	documents.onDidClose(e => {
		syncedDocumentParsedUriToUri.delete(URI.parse(e.document.uri).toString());
	});

	const status = {
		connection,
		initializeParams: undefined as unknown as vscode.InitializeParams,
		initializeResult: undefined as unknown as vscode.InitializeResult,
		languageServicePlugins: [] as unknown as LanguageServicePlugin[],
		projects: undefined as unknown as ServerProjectProvider,
		fs: undefined as unknown as FileSystem,
		pullModelDiagnostics: false,
		documents,
		workspaceFolders: createUriMap<boolean>(),
		getSyncedDocumentKey,
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

	function getSyncedDocumentKey(uri: URI) {
		const originalUri = syncedDocumentParsedUriToUri.get(uri.toString());
		if (originalUri) {
			return originalUri;
		}
	}

	function initialize(
		initializeParams: vscode.InitializeParams,
		languageServicePlugins: LanguageServicePlugin[],
		projects: ServerProjectProvider,
		options?: {
			pullModelDiagnostics?: boolean;
		},
	) {
		status.initializeParams = initializeParams;
		status.languageServicePlugins = languageServicePlugins;
		status.projects = projects;
		status.pullModelDiagnostics = options?.pullModelDiagnostics ?? false;
		status.fs = createFsWithCache(getFs(initializeParams.initializationOptions ?? {}));

		if (initializeParams.workspaceFolders?.length) {
			for (const folder of initializeParams.workspaceFolders) {
				status.workspaceFolders.set(URI.parse(folder.uri), true);
			}
		}
		else if (initializeParams.rootUri) {
			status.workspaceFolders.set(URI.parse(initializeParams.rootUri), true);
		}
		else if (initializeParams.rootPath) {
			status.workspaceFolders.set(URI.file(initializeParams.rootPath), true);
		}

		status.initializeResult = { capabilities: {} };
		status.initializeResult.capabilities = {
			textDocumentSync: vscode.TextDocumentSyncKind.Incremental,
			workspace: {
				// #18
				workspaceFolders: {
					supported: true,
					changeNotifications: true,
				},
			},
			selectionRangeProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.selectionRangeProvider),
			foldingRangeProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.foldingRangeProvider),
			linkedEditingRangeProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.linkedEditingRangeProvider),
			colorProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.colorProvider),
			documentSymbolProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.documentSymbolProvider),
			documentFormattingProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.documentFormattingProvider),
			documentRangeFormattingProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.documentFormattingProvider),
			referencesProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.referencesProvider),
			implementationProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.implementationProvider),
			definitionProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.definitionProvider),
			typeDefinitionProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.typeDefinitionProvider),
			callHierarchyProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.callHierarchyProvider),
			hoverProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.hoverProvider),
			documentHighlightProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.documentHighlightProvider),
			workspaceSymbolProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.workspaceSymbolProvider),
			renameProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.renameProvider)
				? { prepareProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.renameProvider?.prepareProvider) }
				: undefined,
			documentLinkProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.documentLinkProvider)
				? { resolveProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.documentLinkProvider?.resolveProvider) }
				: undefined,
			codeLensProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.codeLensProvider)
				? { resolveProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.codeLensProvider?.resolveProvider) }
				: undefined,
			inlayHintProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.inlayHintProvider)
				? { resolveProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.inlayHintProvider?.resolveProvider) }
				: undefined,
			signatureHelpProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.signatureHelpProvider)
				? {
					triggerCharacters: [...new Set(status.languageServicePlugins.map(plugin => plugin.capabilities.signatureHelpProvider?.triggerCharacters ?? []).flat())],
					retriggerCharacters: [...new Set(status.languageServicePlugins.map(plugin => plugin.capabilities.signatureHelpProvider?.retriggerCharacters ?? []).flat())],
				}
				: undefined,
			completionProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.completionProvider)
				? {
					resolveProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.completionProvider?.resolveProvider),
					triggerCharacters: [...new Set(status.languageServicePlugins.map(plugin => plugin.capabilities.completionProvider?.triggerCharacters ?? []).flat())],
				}
				: undefined,
			semanticTokensProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.semanticTokensProvider)
				? {
					range: true,
					full: false,
					legend: {
						tokenTypes: [...new Set(status.languageServicePlugins.map(plugin => plugin.capabilities.semanticTokensProvider?.legend?.tokenTypes ?? []).flat())],
						tokenModifiers: [...new Set(status.languageServicePlugins.map(plugin => plugin.capabilities.semanticTokensProvider?.legend?.tokenModifiers ?? []).flat())],
					},
				}
				: undefined,
			codeActionProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.codeActionProvider)
				? {
					resolveProvider: true,
					codeActionKinds: [...new Set(status.languageServicePlugins.map(plugin => plugin.capabilities.codeActionProvider?.codeActionKinds ?? []).flat())],
				}
				: undefined,
			diagnosticProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.diagnosticProvider)
				? {
					interFileDependencies: true,
					workspaceDiagnostics: false,
				}
				: undefined,
			documentOnTypeFormattingProvider: status.languageServicePlugins.some(plugin => plugin.capabilities.documentOnTypeFormattingProvider)
				? {
					firstTriggerCharacter: [...new Set(status.languageServicePlugins.map(plugin => plugin.capabilities.documentOnTypeFormattingProvider?.triggerCharacters ?? []).flat())][0],
					moreTriggerCharacter: [...new Set(status.languageServicePlugins.map(plugin => plugin.capabilities.documentOnTypeFormattingProvider?.triggerCharacters ?? []).flat())].slice(1),
				}
				: undefined,
		};

		if (!status.pullModelDiagnostics && status.initializeResult.capabilities.diagnosticProvider) {
			status.initializeResult.capabilities.diagnosticProvider = undefined;
			activateServerPushDiagnostics(projects);
		}

		registerEditorFeatures(status);
		registerLanguageFeatures(status);

		return status.initializeResult;
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

		const readFileCache = createUriMap<ReturnType<FileSystem['readFile']>>();
		const statCache = createUriMap<ReturnType<FileSystem['stat']>>();
		const readDirectoryCache = createUriMap<ReturnType<FileSystem['readDirectory']>>();

		onDidChangeWatchedFiles(({ changes }) => {
			for (const change of changes) {
				const changeUri = URI.parse(change.uri);
				const dir = URI.parse(change.uri.substring(0, change.uri.lastIndexOf('/')));
				if (change.type === vscode.FileChangeType.Deleted) {
					readFileCache.set(changeUri, undefined);
					statCache.set(changeUri, undefined);
					readDirectoryCache.delete(dir);
				}
				else if (change.type === vscode.FileChangeType.Changed) {
					readFileCache.delete(changeUri);
					statCache.delete(changeUri);
				}
				else if (change.type === vscode.FileChangeType.Created) {
					readFileCache.delete(changeUri);
					statCache.delete(changeUri);
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
					status.workspaceFolders.set(URI.parse(folder.uri), true);
				}
				for (const folder of e.removed) {
					status.workspaceFolders.delete(URI.parse(folder.uri));
				}
				status.projects.reload.call(status);
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

	async function pushDiagnostics(projects: ServerProjectProvider, uriStr: string, version: number, cancel: vscode.CancellationToken) {
		const uri = URI.parse(uriStr);
		const languageService = (await projects.get.call(status, uri)).getLanguageService();
		const errors = await languageService.doValidation(uri, cancel, result => {
			connection.sendDiagnostics({ uri: uriStr, diagnostics: result, version });
		});

		connection.sendDiagnostics({ uri: uriStr, diagnostics: errors, version });
	}
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
