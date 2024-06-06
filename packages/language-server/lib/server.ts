import { FileSystem, LanguageServicePlugin, createUriMap } from '@volar/language-service';
import { SnapshotDocument } from '@volar/snapshot-document';
import { configure as configureHttpRequests } from 'request-light';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { registerEditorFeatures } from './register/registerEditorFeatures.js';
import { registerLanguageFeatures } from './register/registerLanguageFeatures.js';
import type { LanguageServerProject, VolarInitializeResult } from './types.js';

export * from '@volar/snapshot-document';

export function createServerBase(
	connection: vscode.Connection,
	fs: FileSystem
) {
	let semanticTokensReq = 0;
	let documentUpdatedReq = 0;

	const syncedDocumentParsedUriToUri = new Map<string, string>();
	const didChangeWatchedFilesCallbacks = new Set<vscode.NotificationHandler<vscode.DidChangeWatchedFilesParams>>();
	const didChangeConfigurationCallbacks = new Set<vscode.NotificationHandler<vscode.DidChangeConfigurationParams>>();
	const configurations = new Map<string, Promise<any>>();
	const documentsCache = new Map<string, WeakRef<SnapshotDocument>>();
	const documents = new vscode.TextDocuments({
		create(uri, languageId, version, text) {
			const cache = documentsCache.get(uri)?.deref();
			if (cache && cache.languageId === languageId && cache.version === version && cache.getText() === text) {
				return cache;
			}
			const document = new SnapshotDocument(uri, languageId, version, text);
			documentsCache.set(uri, new WeakRef(document));
			return document;
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
		fs: createFsWithCache(fs),
		initializeParams: undefined as unknown as vscode.InitializeParams,
		initializeResult: undefined as unknown as VolarInitializeResult,
		languageServicePlugins: [] as unknown as LanguageServicePlugin[],
		project: undefined as unknown as LanguageServerProject,
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
		project: LanguageServerProject,
		languageServicePlugins: LanguageServicePlugin[],
		options?: {
			pullModelDiagnostics?: boolean;
		}
	) {
		status.initializeParams = initializeParams;
		status.project = project;
		status.languageServicePlugins = languageServicePlugins;
		status.pullModelDiagnostics = options?.pullModelDiagnostics ?? false;

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

		const capabilitiesArr = status.languageServicePlugins.map(plugin => plugin.capabilities);

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
			selectionRangeProvider: capabilitiesArr.some(data => data.selectionRangeProvider) ? true : undefined,
			foldingRangeProvider: capabilitiesArr.some(data => data.foldingRangeProvider) ? true : undefined,
			linkedEditingRangeProvider: capabilitiesArr.some(data => data.linkedEditingRangeProvider) ? true : undefined,
			colorProvider: capabilitiesArr.some(data => data.colorProvider) ? true : undefined,
			documentSymbolProvider: capabilitiesArr.some(data => data.documentSymbolProvider) ? true : undefined,
			documentFormattingProvider: capabilitiesArr.some(data => data.documentFormattingProvider) ? true : undefined,
			documentRangeFormattingProvider: capabilitiesArr.some(data => data.documentFormattingProvider) ? true : undefined,
			referencesProvider: capabilitiesArr.some(data => data.referencesProvider) ? true : undefined,
			implementationProvider: capabilitiesArr.some(data => data.implementationProvider) ? true : undefined,
			definitionProvider: capabilitiesArr.some(data => data.definitionProvider) ? true : undefined,
			typeDefinitionProvider: capabilitiesArr.some(data => data.typeDefinitionProvider) ? true : undefined,
			callHierarchyProvider: capabilitiesArr.some(data => data.callHierarchyProvider) ? true : undefined,
			hoverProvider: capabilitiesArr.some(data => data.hoverProvider) ? true : undefined,
			documentHighlightProvider: capabilitiesArr.some(data => data.documentHighlightProvider) ? true : undefined,
			workspaceSymbolProvider: capabilitiesArr.some(data => data.workspaceSymbolProvider) ? true : undefined,
			renameProvider: capabilitiesArr.some(data => data.renameProvider)
				? { prepareProvider: capabilitiesArr.some(data => data.renameProvider?.prepareProvider) }
				: undefined,
			documentLinkProvider: capabilitiesArr.some(data => data.documentLinkProvider)
				? { resolveProvider: capabilitiesArr.some(data => data.documentLinkProvider?.resolveProvider) }
				: undefined,
			codeLensProvider: capabilitiesArr.some(data => data.codeLensProvider)
				? { resolveProvider: capabilitiesArr.some(data => data.codeLensProvider?.resolveProvider) }
				: undefined,
			inlayHintProvider: capabilitiesArr.some(data => data.inlayHintProvider)
				? { resolveProvider: capabilitiesArr.some(data => data.inlayHintProvider?.resolveProvider) }
				: undefined,
			signatureHelpProvider: capabilitiesArr.some(data => data.signatureHelpProvider)
				? {

					triggerCharacters: [...new Set(capabilitiesArr.map(data => data.signatureHelpProvider?.triggerCharacters ?? []).flat())],
					retriggerCharacters: [...new Set(capabilitiesArr.map(data => data.signatureHelpProvider?.retriggerCharacters ?? []).flat())],
				}
				: undefined,
			completionProvider: capabilitiesArr.some(data => data.completionProvider)
				? {
					resolveProvider: capabilitiesArr.some(data => data.completionProvider?.resolveProvider),
					triggerCharacters: [...new Set(capabilitiesArr.map(data => data.completionProvider?.triggerCharacters ?? []).flat())],
				}
				: undefined,
			semanticTokensProvider: capabilitiesArr.some(data => data.semanticTokensProvider)
				? {
					range: true,
					full: false,
					legend: {
						tokenTypes: [...new Set(capabilitiesArr.map(data => data.semanticTokensProvider?.legend?.tokenTypes ?? []).flat())],
						tokenModifiers: [...new Set(capabilitiesArr.map(data => data.semanticTokensProvider?.legend?.tokenModifiers ?? []).flat())],
					},
				}
				: undefined,
			codeActionProvider: capabilitiesArr.some(data => data.codeActionProvider)
				? {
					resolveProvider: capabilitiesArr.some(data => data.codeActionProvider?.resolveProvider),
					codeActionKinds: capabilitiesArr.some(data => data.codeActionProvider?.codeActionKinds)
						? [...new Set(capabilitiesArr.map(data => data.codeActionProvider?.codeActionKinds ?? []).flat())]
						: undefined,
				}
				: undefined,
			diagnosticProvider: capabilitiesArr.some(data => data.diagnosticProvider)
				? {
					interFileDependencies: true,
					workspaceDiagnostics: false,
				}
				: undefined,
			documentOnTypeFormattingProvider: capabilitiesArr.some(data => data.documentOnTypeFormattingProvider)
				? {
					firstTriggerCharacter: [...new Set(capabilitiesArr.map(data => data.documentOnTypeFormattingProvider?.triggerCharacters ?? []).flat())][0],
					moreTriggerCharacter: [...new Set(capabilitiesArr.map(data => data.documentOnTypeFormattingProvider?.triggerCharacters ?? []).flat())].slice(1),
				}
				: undefined,
		};

		if (!status.pullModelDiagnostics && status.initializeResult.capabilities.diagnosticProvider) {
			status.initializeResult.capabilities.diagnosticProvider = undefined;
			activateServerPushDiagnostics(project);
		}

		if (capabilitiesArr.some(data => data.autoInsertionProvider)) {
			const triggerCharacterToConfigurationSections = new Map<string, Set<string>>();
			const tryAdd = (char: string, section?: string) => {
				let sectionSet = triggerCharacterToConfigurationSections.get(char);
				if (!sectionSet) {
					triggerCharacterToConfigurationSections.set(char, sectionSet = new Set());
				}
				if (section) {
					sectionSet.add(section);
				}
			};
			for (const data of capabilitiesArr) {
				if (data.autoInsertionProvider) {
					const { triggerCharacters, configurationSections } = data.autoInsertionProvider;
					if (configurationSections) {
						if (configurationSections.length !== triggerCharacters.length) {
							throw new Error('configurationSections.length !== triggerCharacters.length');
						}
						for (let i = 0; i < configurationSections.length; i++) {
							tryAdd(triggerCharacters[i], configurationSections[i]);
						}
					}
					else {
						for (const char of triggerCharacters) {
							tryAdd(char);
						}
					}
				}
			}
			status.initializeResult.autoInsertion = {
				triggerCharacters: [],
				configurationSections: [],
			};
			for (const [char, sections] of triggerCharacterToConfigurationSections) {
				if (sections.size) {
					for (const section of sections) {
						status.initializeResult.autoInsertion.triggerCharacters.push(char);
						status.initializeResult.autoInsertion.configurationSections.push(section);
					}
				}
				else {
					status.initializeResult.autoInsertion.triggerCharacters.push(char);
					status.initializeResult.autoInsertion.configurationSections.push(null);
				}
			}
		}

		return status.initializeResult;
	}

	function initialized() {
		status.project.setup(status);
		registerEditorFeatures(status);
		registerLanguageFeatures(status);
		registerWorkspaceFoldersWatcher();
		registerConfigurationWatcher();
		updateHttpSettings();
		onDidChangeConfiguration(updateHttpSettings);
	}

	function shutdown() {
		status.project.reload();
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

		documents.onDidSave(({ document }) => {
			const uri = URI.parse(document.uri);
			readFileCache.set(uri, document.getText());
			statCache.delete(uri);
		});

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

	function registerWorkspaceFoldersWatcher() {
		if (status.initializeParams?.capabilities.workspace?.workspaceFolders) {
			connection.workspace.onDidChangeWorkspaceFolders(e => {
				for (const folder of e.added) {
					status.workspaceFolders.set(URI.parse(folder.uri), true);
				}
				for (const folder of e.removed) {
					status.workspaceFolders.delete(URI.parse(folder.uri));
				}
				status.project.reload();
			});
		}
	}

	function activateServerPushDiagnostics(projects: LanguageServerProject) {
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

	async function refresh(projects: LanguageServerProject) {

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

	async function pushAllDiagnostics(projects: LanguageServerProject, docUri?: string) {
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

	async function pushDiagnostics(projects: LanguageServerProject, uriStr: string, version: number, cancel: vscode.CancellationToken) {
		const uri = URI.parse(uriStr);
		const languageService = (await projects.getLanguageService(uri));
		const errors = await languageService.doValidation(uri, cancel, result => {
			connection.sendDiagnostics({ uri: uriStr, diagnostics: result, version });
		});

		connection.sendDiagnostics({ uri: uriStr, diagnostics: errors, version });
	}
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
