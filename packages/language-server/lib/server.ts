import { createUriMap, Disposable, FileSystem, LanguageServicePlugin } from '@volar/language-service';
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
	let watchFilesDisposableCounter = 0;
	let watchFilesDisposable: Disposable | undefined;

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

	const state = {
		connection,
		fs: createFsWithCache(fs),
		initializeParams: undefined! as vscode.InitializeParams,
		initializeResult: undefined! as VolarInitializeResult,
		languageServicePlugins: [] as LanguageServicePlugin[],
		project: undefined! as LanguageServerProject,
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
		refresh,
	};
	return state;

	function getSyncedDocumentKey(uri: URI) {
		const originalUri = syncedDocumentParsedUriToUri.get(uri.toString());
		if (originalUri) {
			return originalUri;
		}
	}

	function initialize(
		params: vscode.InitializeParams,
		project: LanguageServerProject,
		languageServicePlugins: LanguageServicePlugin[]
	) {
		state.initializeParams = params;
		state.project = project;
		state.languageServicePlugins = languageServicePlugins;

		if (params.workspaceFolders?.length) {
			for (const folder of params.workspaceFolders) {
				state.workspaceFolders.set(URI.parse(folder.uri), true);
			}
		}
		else if (params.rootUri) {
			state.workspaceFolders.set(URI.parse(params.rootUri), true);
		}
		else if (params.rootPath) {
			state.workspaceFolders.set(URI.file(params.rootPath), true);
		}

		state.initializeResult = { capabilities: {} };
		state.initializeResult.capabilities = {
			textDocumentSync: vscode.TextDocumentSyncKind.Incremental,
			workspace: {
				// #18
				workspaceFolders: {
					supported: true,
					changeNotifications: true,
				},
			},
			selectionRangeProvider: languageServicePlugins.some(({ capabilities }) => capabilities.selectionRangeProvider) || undefined,
			foldingRangeProvider: languageServicePlugins.some(({ capabilities }) => capabilities.foldingRangeProvider) || undefined,
			linkedEditingRangeProvider: languageServicePlugins.some(({ capabilities }) => capabilities.linkedEditingRangeProvider) || undefined,
			colorProvider: languageServicePlugins.some(({ capabilities }) => capabilities.colorProvider) || undefined,
			documentSymbolProvider: languageServicePlugins.some(({ capabilities }) => capabilities.documentSymbolProvider) || undefined,
			documentFormattingProvider: languageServicePlugins.some(({ capabilities }) => capabilities.documentFormattingProvider) || undefined,
			documentRangeFormattingProvider: languageServicePlugins.some(({ capabilities }) => capabilities.documentFormattingProvider) || undefined,
			referencesProvider: languageServicePlugins.some(({ capabilities }) => capabilities.referencesProvider) || undefined,
			implementationProvider: languageServicePlugins.some(({ capabilities }) => capabilities.implementationProvider) || undefined,
			definitionProvider: languageServicePlugins.some(({ capabilities }) => capabilities.definitionProvider) || undefined,
			typeDefinitionProvider: languageServicePlugins.some(({ capabilities }) => capabilities.typeDefinitionProvider) || undefined,
			callHierarchyProvider: languageServicePlugins.some(({ capabilities }) => capabilities.callHierarchyProvider) || undefined,
			hoverProvider: languageServicePlugins.some(({ capabilities }) => capabilities.hoverProvider) || undefined,
			documentHighlightProvider: languageServicePlugins.some(({ capabilities }) => capabilities.documentHighlightProvider) || undefined,
			workspaceSymbolProvider: languageServicePlugins.some(({ capabilities }) => capabilities.workspaceSymbolProvider)
				? { resolveProvider: languageServicePlugins.some(({ capabilities }) => capabilities.workspaceSymbolProvider?.resolveProvider) || undefined }
				: undefined,
			renameProvider: languageServicePlugins.some(({ capabilities }) => capabilities.renameProvider)
				? { prepareProvider: languageServicePlugins.some(({ capabilities }) => capabilities.renameProvider?.prepareProvider) || undefined }
				: undefined,
			documentLinkProvider: languageServicePlugins.some(({ capabilities }) => capabilities.documentLinkProvider)
				? { resolveProvider: languageServicePlugins.some(({ capabilities }) => capabilities.documentLinkProvider?.resolveProvider) || undefined }
				: undefined,
			codeLensProvider: languageServicePlugins.some(({ capabilities }) => capabilities.codeLensProvider)
				? { resolveProvider: languageServicePlugins.some(({ capabilities }) => capabilities.codeLensProvider?.resolveProvider) || undefined }
				: undefined,
			inlayHintProvider: languageServicePlugins.some(({ capabilities }) => capabilities.inlayHintProvider)
				? { resolveProvider: languageServicePlugins.some(({ capabilities }) => capabilities.inlayHintProvider?.resolveProvider) || undefined }
				: undefined,
			signatureHelpProvider: languageServicePlugins.some(({ capabilities }) => capabilities.signatureHelpProvider)
				? {
					triggerCharacters: [...new Set(languageServicePlugins.map(({ capabilities }) => capabilities.signatureHelpProvider?.triggerCharacters ?? []).flat())],
					retriggerCharacters: [...new Set(languageServicePlugins.map(({ capabilities }) => capabilities.signatureHelpProvider?.retriggerCharacters ?? []).flat())],
				}
				: undefined,
			completionProvider: languageServicePlugins.some(({ capabilities }) => capabilities.completionProvider)
				? {
					resolveProvider: languageServicePlugins.some(({ capabilities }) => capabilities.completionProvider?.resolveProvider) || undefined,
					triggerCharacters: [...new Set(languageServicePlugins.map(({ capabilities }) => capabilities.completionProvider?.triggerCharacters ?? []).flat())],
				}
				: undefined,
			semanticTokensProvider: languageServicePlugins.some(({ capabilities }) => capabilities.semanticTokensProvider)
				? {
					range: true,
					full: false,
					legend: {
						tokenTypes: [...new Set(languageServicePlugins.map(({ capabilities }) => capabilities.semanticTokensProvider?.legend?.tokenTypes ?? []).flat())],
						tokenModifiers: [...new Set(languageServicePlugins.map(({ capabilities }) => capabilities.semanticTokensProvider?.legend?.tokenModifiers ?? []).flat())],
					},
				}
				: undefined,
			codeActionProvider: languageServicePlugins.some(({ capabilities }) => capabilities.codeActionProvider)
				? {
					resolveProvider: languageServicePlugins.some(({ capabilities }) => capabilities.codeActionProvider?.resolveProvider) || undefined,
					codeActionKinds: languageServicePlugins.some(({ capabilities }) => capabilities.codeActionProvider?.codeActionKinds)
						? [...new Set(languageServicePlugins.map(({ capabilities }) => capabilities.codeActionProvider?.codeActionKinds ?? []).flat())]
						: undefined,
				}
				: undefined,
			documentOnTypeFormattingProvider: languageServicePlugins.some(({ capabilities }) => capabilities.documentOnTypeFormattingProvider)
				? {
					firstTriggerCharacter: [...new Set(languageServicePlugins.map(({ capabilities }) => capabilities.documentOnTypeFormattingProvider?.triggerCharacters ?? []).flat())][0],
					moreTriggerCharacter: [...new Set(languageServicePlugins.map(({ capabilities }) => capabilities.documentOnTypeFormattingProvider?.triggerCharacters ?? []).flat())].slice(1),
				}
				: undefined,
			executeCommandProvider: languageServicePlugins.some(({ capabilities }) => capabilities.executeCommandProvider)
				? {
					commands: [...new Set(languageServicePlugins.map(({ capabilities }) => capabilities.executeCommandProvider?.commands ?? []).flat())],
				}
				: undefined,
		};

		if (languageServicePlugins.some(({ capabilities }) => capabilities.diagnosticProvider)) {
			state.initializeResult.capabilities.diagnosticProvider = {
				// Unreliable, see https://github.com/microsoft/vscode-languageserver-node/issues/848#issuecomment-2189521060
				interFileDependencies: false,
				workspaceDiagnostics: languageServicePlugins.some(({ capabilities }) => capabilities.diagnosticProvider?.workspaceDiagnostics),
			};
			const supportsDiagnosticPull = !!params.capabilities.workspace?.diagnostics;
			if (!supportsDiagnosticPull) {
				documents.onDidChangeContent(({ document }) => {
					const changedDocument = documents.get(document.uri);
					if (!changedDocument) {
						return;
					}
					if (languageServicePlugins.some(({ capabilities }) => capabilities.diagnosticProvider?.interFileDependencies)) {
						const remainingDocuments = [...documents.all()].filter(doc => doc !== changedDocument);
						updateDiagnosticsBatch(project, [changedDocument, ...remainingDocuments]);
					}
					else {
						updateDiagnosticsBatch(project, [changedDocument]);
					}
				});
				documents.onDidClose(({ document }) => {
					connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
				});
			}
			onDidChangeConfiguration(() => refresh(project, false));
		}

		if (languageServicePlugins.some(({ capabilities }) => capabilities.autoInsertionProvider)) {
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
			for (const { capabilities } of languageServicePlugins) {
				if (capabilities.autoInsertionProvider) {
					const { triggerCharacters, configurationSections } = capabilities.autoInsertionProvider;
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
			state.initializeResult.capabilities.experimental ??= {};
			state.initializeResult.capabilities.experimental.autoInsertionProvider = {
				triggerCharacters: [],
				configurationSections: [],
			};
			for (const [char, sections] of triggerCharacterToConfigurationSections) {
				if (sections.size) {
					state.initializeResult.capabilities.experimental.autoInsertionProvider.triggerCharacters.push(char);
					state.initializeResult.capabilities.experimental.autoInsertionProvider.configurationSections!.push([...sections]);
				}
				else {
					state.initializeResult.autoInsertionProvider.triggerCharacters.push(char);
					state.initializeResult.autoInsertionProvider.configurationSections.push(null);
				}
			}
		}

		if (languageServicePlugins.some(({ capabilities }) => capabilities.fileRenameProvider)) {
			state.initializeResult.capabilities.experimental ??= {};
			state.initializeResult.capabilities.experimental.fileRenameProvider = true;
		}

		if (languageServicePlugins.some(({ capabilities }) => capabilities.fileReferencesProvider)) {
			state.initializeResult.capabilities.experimental ??= {};
			state.initializeResult.capabilities.experimental.fileReferencesProvider = true;
		}

		return state.initializeResult;
	}

	function initialized() {
		state.project.setup(state);
		registerEditorFeatures(state);
		registerLanguageFeatures(state);
		registerWorkspaceFoldersWatcher();
		registerConfigurationWatcher();
		updateHttpSettings();
		onDidChangeConfiguration(updateHttpSettings);
	}

	function shutdown() {
		state.project.reload();
	}

	async function updateHttpSettings() {
		const httpSettings = await getConfiguration<{ proxyStrictSSL: boolean; proxy: string; }>('http');
		configureHttpRequests(httpSettings?.proxy, httpSettings?.proxyStrictSSL ?? false);
	}

	function getConfiguration<T>(section: string, scopeUri?: string): Promise<T | undefined> {
		if (!state.initializeParams?.capabilities.workspace?.configuration) {
			return Promise.resolve(undefined);
		}
		if (!scopeUri && state.initializeParams.capabilities.workspace?.didChangeConfiguration) {
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
		const didChangeConfiguration = state.initializeParams?.capabilities.workspace?.didChangeConfiguration;
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

	async function watchFiles(patterns: string[]): Promise<Disposable> {
		const disposables: Disposable[] = [];
		const didChangeWatchedFiles = state.initializeParams?.capabilities.workspace?.didChangeWatchedFiles;
		const fileOperations = state.initializeParams?.capabilities.workspace?.fileOperations;
		if (didChangeWatchedFiles) {
			if (watchFilesDisposableCounter === 0) {
				watchFilesDisposable = connection.onDidChangeWatchedFiles(e => {
					for (const cb of didChangeWatchedFilesCallbacks) {
						cb(e);
					}
				});
			}
			watchFilesDisposableCounter++;
			disposables.push(
				{
					dispose() {
						watchFilesDisposableCounter--;
						if (watchFilesDisposableCounter === 0) {
							watchFilesDisposable?.dispose();
						}
					}
				}
			);
		}
		if (didChangeWatchedFiles?.dynamicRegistration) {
			disposables.push(
				await connection.client.register(vscode.DidChangeWatchedFilesNotification.type, {
					watchers: patterns.map(pattern => ({ globPattern: pattern })),
				})
			);
		}
		if (fileOperations?.dynamicRegistration && fileOperations.willRename) {
			disposables.push(
				await connection.client.register(vscode.WillRenameFilesRequest.type, {
					filters: patterns.map(pattern => ({ pattern: { glob: pattern } })),
				})
			);
		}
		return fromDisposables(disposables);
	}

	function registerWorkspaceFoldersWatcher() {
		if (state.initializeParams?.capabilities.workspace?.workspaceFolders) {
			connection.workspace.onDidChangeWorkspaceFolders(e => {
				for (const folder of e.added) {
					state.workspaceFolders.set(URI.parse(folder.uri), true);
				}
				for (const folder of e.removed) {
					state.workspaceFolders.delete(URI.parse(folder.uri));
				}
				state.project.reload();
			});
		}
	}

	async function refresh(project: LanguageServerProject, clearDiagnostics: boolean) {
		const req = ++semanticTokensReq;
		const supportsDiagnosticPull = !!state.initializeParams.capabilities.workspace?.diagnostics;

		if (!supportsDiagnosticPull) {
			if (clearDiagnostics) {
				for (const document of documents.all()) {
					connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
				}
			}
			await updateDiagnosticsBatch(project, [...documents.all()]);
		}

		const delay = 250;
		await sleep(delay);

		if (req !== semanticTokensReq) {
			return;
		}

		if (state.initializeResult.capabilities.semanticTokensProvider) {
			if (state.initializeParams?.capabilities.workspace?.semanticTokens?.refreshSupport) {
				connection.languages.semanticTokens.refresh();
			}
			else {
				console.warn('Semantic tokens refresh is not supported by the client.');
			}
		}
		if (state.initializeResult.capabilities.inlayHintProvider) {
			if (state.initializeParams?.capabilities.workspace?.inlayHint?.refreshSupport) {
				connection.languages.inlayHint.refresh();
			}
			else {
				console.warn('Inlay hint refresh is not supported by the client.');
			}
		}
		if (state.initializeResult.capabilities.diagnosticProvider) {
			if (state.initializeParams?.capabilities.workspace?.diagnostics?.refreshSupport) {
				connection.languages.diagnostics.refresh();
			}
			else {
				console.warn('Diagnostics refresh is not supported by the client.');
			}
		}
	}

	async function updateDiagnosticsBatch(project: LanguageServerProject, documents: SnapshotDocument[]) {
		const req = ++documentUpdatedReq;
		const delay = 250;
		const token: vscode.CancellationToken = {
			get isCancellationRequested() {
				return req !== documentUpdatedReq;
			},
			onCancellationRequested: vscode.Event.None,
		};
		for (const doc of documents) {
			await sleep(delay);
			if (token.isCancellationRequested) {
				break;
			}
			await updateDiagnostics(project, doc.uri, doc.version, token);
		}
	}

	async function updateDiagnostics(project: LanguageServerProject, uriStr: string, version: number, token: vscode.CancellationToken) {
		const uri = URI.parse(uriStr);
		const languageService = await project.getLanguageService(uri);
		const diagnostics = await languageService.getDiagnostics(
			uri,
			diagnostics => connection.sendDiagnostics({ uri: uriStr, diagnostics, version }),
			token
		);
		if (!token.isCancellationRequested) {
			connection.sendDiagnostics({ uri: uriStr, diagnostics, version });
		}
	}
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function fromDisposables(disposables: Disposable[]): Disposable {
	return {
		dispose() {
			for (const disposable of disposables) {
				disposable.dispose();
			}
		},
	};
}
