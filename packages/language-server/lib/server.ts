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

		const pluginCapabilities = state.languageServicePlugins.map(plugin => plugin.capabilities);

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
			selectionRangeProvider: pluginCapabilities.some(data => data.selectionRangeProvider) || undefined,
			foldingRangeProvider: pluginCapabilities.some(data => data.foldingRangeProvider) || undefined,
			linkedEditingRangeProvider: pluginCapabilities.some(data => data.linkedEditingRangeProvider) || undefined,
			colorProvider: pluginCapabilities.some(data => data.colorProvider) || undefined,
			documentSymbolProvider: pluginCapabilities.some(data => data.documentSymbolProvider) || undefined,
			documentFormattingProvider: pluginCapabilities.some(data => data.documentFormattingProvider) || undefined,
			documentRangeFormattingProvider: pluginCapabilities.some(data => data.documentFormattingProvider) || undefined,
			referencesProvider: pluginCapabilities.some(data => data.referencesProvider) || undefined,
			implementationProvider: pluginCapabilities.some(data => data.implementationProvider) || undefined,
			definitionProvider: pluginCapabilities.some(data => data.definitionProvider) || undefined,
			typeDefinitionProvider: pluginCapabilities.some(data => data.typeDefinitionProvider) || undefined,
			callHierarchyProvider: pluginCapabilities.some(data => data.callHierarchyProvider) || undefined,
			hoverProvider: pluginCapabilities.some(data => data.hoverProvider) || undefined,
			documentHighlightProvider: pluginCapabilities.some(data => data.documentHighlightProvider) || undefined,
			workspaceSymbolProvider: pluginCapabilities.some(data => data.workspaceSymbolProvider)
				? { resolveProvider: pluginCapabilities.some(data => data.workspaceSymbolProvider?.resolveProvider) || undefined }
				: undefined,
			renameProvider: pluginCapabilities.some(data => data.renameProvider)
				? { prepareProvider: pluginCapabilities.some(data => data.renameProvider?.prepareProvider) || undefined }
				: undefined,
			documentLinkProvider: pluginCapabilities.some(data => data.documentLinkProvider)
				? { resolveProvider: pluginCapabilities.some(data => data.documentLinkProvider?.resolveProvider) || undefined }
				: undefined,
			codeLensProvider: pluginCapabilities.some(data => data.codeLensProvider)
				? { resolveProvider: pluginCapabilities.some(data => data.codeLensProvider?.resolveProvider) || undefined }
				: undefined,
			inlayHintProvider: pluginCapabilities.some(data => data.inlayHintProvider)
				? { resolveProvider: pluginCapabilities.some(data => data.inlayHintProvider?.resolveProvider) || undefined }
				: undefined,
			signatureHelpProvider: pluginCapabilities.some(data => data.signatureHelpProvider)
				? {
					triggerCharacters: [...new Set(pluginCapabilities.map(data => data.signatureHelpProvider?.triggerCharacters ?? []).flat())],
					retriggerCharacters: [...new Set(pluginCapabilities.map(data => data.signatureHelpProvider?.retriggerCharacters ?? []).flat())],
				}
				: undefined,
			completionProvider: pluginCapabilities.some(data => data.completionProvider)
				? {
					resolveProvider: pluginCapabilities.some(data => data.completionProvider?.resolveProvider) || undefined,
					triggerCharacters: [...new Set(pluginCapabilities.map(data => data.completionProvider?.triggerCharacters ?? []).flat())],
				}
				: undefined,
			semanticTokensProvider: pluginCapabilities.some(data => data.semanticTokensProvider)
				? {
					range: true,
					full: false,
					legend: {
						tokenTypes: [...new Set(pluginCapabilities.map(data => data.semanticTokensProvider?.legend?.tokenTypes ?? []).flat())],
						tokenModifiers: [...new Set(pluginCapabilities.map(data => data.semanticTokensProvider?.legend?.tokenModifiers ?? []).flat())],
					},
				}
				: undefined,
			codeActionProvider: pluginCapabilities.some(data => data.codeActionProvider)
				? {
					resolveProvider: pluginCapabilities.some(data => data.codeActionProvider?.resolveProvider) || undefined,
					codeActionKinds: pluginCapabilities.some(data => data.codeActionProvider?.codeActionKinds)
						? [...new Set(pluginCapabilities.map(data => data.codeActionProvider?.codeActionKinds ?? []).flat())]
						: undefined,
				}
				: undefined,
			documentOnTypeFormattingProvider: pluginCapabilities.some(data => data.documentOnTypeFormattingProvider)
				? {
					firstTriggerCharacter: [...new Set(pluginCapabilities.map(data => data.documentOnTypeFormattingProvider?.triggerCharacters ?? []).flat())][0],
					moreTriggerCharacter: [...new Set(pluginCapabilities.map(data => data.documentOnTypeFormattingProvider?.triggerCharacters ?? []).flat())].slice(1),
				}
				: undefined,
			executeCommandProvider: pluginCapabilities.some(data => data.executeCommandProvider)
				? {
					commands: [...new Set(pluginCapabilities.map(data => data.executeCommandProvider?.commands ?? []).flat())],
				}
				: undefined,
		};

		if (pluginCapabilities.some(data => data.diagnosticProvider)) {
			state.initializeResult.capabilities.diagnosticProvider = {
				// Unreliable, see https://github.com/microsoft/vscode-languageserver-node/issues/848#issuecomment-2189521060
				interFileDependencies: false,
				workspaceDiagnostics: pluginCapabilities.some(data => data.diagnosticProvider?.workspaceDiagnostics),
			};
			const supportsDiagnosticPull = !!params.capabilities.workspace?.diagnostics;
			if (!supportsDiagnosticPull) {
				documents.onDidChangeContent(({ document }) => {
					updateAllDiagnostics(project, document.uri);
				});
				documents.onDidClose(({ document }) => {
					connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
				});
			}
			onDidChangeConfiguration(() => refresh(project, false));
		}

		if (pluginCapabilities.some(data => data.autoInsertionProvider)) {
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
			for (const data of pluginCapabilities) {
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

		if (pluginCapabilities.some(data => data.fileRenameProvider)) {
			state.initializeResult.capabilities.experimental ??= {};
			state.initializeResult.capabilities.experimental.fileRenameProvider = true;
		}

		if (pluginCapabilities.some(data => data.fileReferencesProvider)) {
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

		if (!state.initializeResult.capabilities.diagnosticProvider) {
			if (clearDiagnostics) {
				for (const document of documents.all()) {
					connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
				}
			}
			await updateAllDiagnostics(project);
		}

		const delay = 250;
		await sleep(delay);

		if (req === semanticTokensReq) {
			if (
				state.initializeResult.capabilities.semanticTokensProvider
				&& state.initializeParams?.capabilities.workspace?.semanticTokens?.refreshSupport
			) {
				connection.languages.semanticTokens.refresh();
			}
			if (
				state.initializeResult.capabilities.inlayHintProvider
				&& state.initializeParams?.capabilities.workspace?.inlayHint?.refreshSupport
			) {
				connection.languages.inlayHint.refresh();
			}
			if (
				state.initializeResult.capabilities.diagnosticProvider
				&& state.initializeParams?.capabilities.workspace?.diagnostics?.refreshSupport
			) {
				connection.languages.diagnostics.refresh();
			}
		}
	}

	async function updateAllDiagnostics(project: LanguageServerProject, changeDocUri?: string) {
		const req = ++documentUpdatedReq;
		const delay = 250;
		const token: vscode.CancellationToken = {
			get isCancellationRequested() {
				return req !== documentUpdatedReq;
			},
			onCancellationRequested: vscode.Event.None,
		};
		const changedDocument = changeDocUri ? documents.get(changeDocUri) : undefined;
		const remainingDocuments = [...documents.all()].filter(doc => doc !== changedDocument);

		for (const doc of [changedDocument, ...remainingDocuments].filter(doc => !!doc)) {
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
