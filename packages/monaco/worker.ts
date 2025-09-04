import {
	type CancellationToken,
	createLanguage,
	createLanguageService,
	createUriMap,
	type Language,
	type LanguagePlugin,
	type LanguageService,
	type LanguageServiceEnvironment,
	type LanguageServicePlugin,
	type ProjectContext,
	type ProviderResult,
} from '@volar/language-service';
import { createLanguageServiceHost, createSys, resolveFileLanguageId } from '@volar/typescript';
import type * as monaco from 'monaco-types';
import type * as ts from 'typescript';
import { URI } from 'vscode-uri';

export * from '@volar/language-service';

const fsFileSnapshots = createUriMap<[number | undefined, ts.IScriptSnapshot | undefined]>();

export function createSimpleWorkerLanguageService({
	env,
	workerContext,
	languagePlugins,
	languageServicePlugins,
	setup,
}: {
	env: LanguageServiceEnvironment;
	workerContext: monaco.worker.IWorkerContext<any>;
	languagePlugins: LanguagePlugin<URI>[];
	languageServicePlugins: LanguageServicePlugin[];
	setup?(options: {
		language: Language<URI>;
		project: ProjectContext;
	}): void;
}) {
	const snapshots = new Map<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const language = createLanguage<URI>(
		languagePlugins,
		createUriMap(false),
		uri => {
			const model = workerContext.getMirrorModels().find(model => model.uri.toString() === uri.toString());
			if (model) {
				const cache = snapshots.get(model);
				if (cache && cache[0] === model.version) {
					return;
				}
				const text = model.getValue();
				const snapshot: ts.IScriptSnapshot = {
					getText: (start, end) => text.substring(start, end),
					getLength: () => text.length,
					getChangeRange: () => undefined,
				};
				snapshots.set(model, [model.version, snapshot]);
				language.scripts.set(uri, snapshot);
			}
			else {
				language.scripts.delete(uri);
			}
		},
	);
	const project: ProjectContext = {};
	setup?.({ language, project });

	return new WorkerLanguageService(
		createLanguageService(
			language,
			languageServicePlugins,
			env,
			project,
		),
	);
}

export function createTypeScriptWorkerLanguageService({
	typescript: ts,
	compilerOptions,
	env,
	uriConverter,
	workerContext,
	languagePlugins,
	languageServicePlugins,
	setup,
}: {
	typescript: typeof import('typescript');
	compilerOptions: ts.CompilerOptions;
	env: LanguageServiceEnvironment;
	uriConverter: {
		asUri(fileName: string): URI;
		asFileName(uri: URI): string;
	};
	workerContext: monaco.worker.IWorkerContext<any>;
	languagePlugins: LanguagePlugin<URI>[];
	languageServicePlugins: LanguageServicePlugin[];
	setup?(options: {
		language: Language<URI>;
		project: ProjectContext;
	}): void;
}) {
	let projectVersion = 0;

	const modelSnapshot = new WeakMap<monaco.worker.IMirrorModel, readonly [number, ts.IScriptSnapshot]>();
	const modelVersions = new Map<monaco.worker.IMirrorModel, number>();
	const sys = createSys(
		ts.sys,
		env,
		() => {
			if (env.workspaceFolders.length) {
				return uriConverter.asFileName(env.workspaceFolders[0]);
			}
			return '';
		},
		uriConverter,
	);
	const language = createLanguage<URI>(
		[
			...languagePlugins,
			{ getLanguageId: uri => resolveFileLanguageId(uri.path) },
		],
		createUriMap(sys.useCaseSensitiveFileNames),
		(uri, includeFsFiles) => {
			let snapshot: ts.IScriptSnapshot | undefined;

			const model = workerContext.getMirrorModels().find(model => model.uri.toString() === uri.toString());
			if (model) {
				const cache = modelSnapshot.get(model);
				if (cache && cache[0] === model.version) {
					return cache[1];
				}
				const text = model.getValue();
				modelSnapshot.set(model, [model.version, {
					getText: (start, end) => text.substring(start, end),
					getLength: () => text.length,
					getChangeRange: () => undefined,
				}]);
				snapshot = modelSnapshot.get(model)?.[1];
			}
			else if (includeFsFiles) {
				const cache = fsFileSnapshots.get(uri);
				const fileName = uriConverter.asFileName(uri);
				const modifiedTime = sys.getModifiedTime?.(fileName)?.valueOf();
				if (!cache || cache[0] !== modifiedTime) {
					if (sys.fileExists(fileName)) {
						const text = sys.readFile(fileName);
						const snapshot = text !== undefined ? ts.ScriptSnapshot.fromString(text) : undefined;
						fsFileSnapshots.set(uri, [modifiedTime, snapshot]);
					}
					else {
						fsFileSnapshots.set(uri, [modifiedTime, undefined]);
					}
				}
				snapshot = fsFileSnapshots.get(uri)?.[1];
			}

			if (snapshot) {
				language.scripts.set(uri, snapshot);
			}
			else {
				language.scripts.delete(uri);
			}
		},
	);
	const project: ProjectContext = {
		typescript: {
			configFileName: undefined,
			sys,
			uriConverter,
			...createLanguageServiceHost(
				ts,
				sys,
				language,
				s => uriConverter.asUri(s),
				{
					getCurrentDirectory() {
						return sys.getCurrentDirectory();
					},
					getScriptFileNames() {
						return workerContext.getMirrorModels().map(model => uriConverter.asFileName(URI.from(model.uri)));
					},
					getProjectVersion() {
						const models = workerContext.getMirrorModels();
						if (modelVersions.size === workerContext.getMirrorModels().length) {
							if (models.every(model => modelVersions.get(model) === model.version)) {
								return projectVersion.toString();
							}
						}
						modelVersions.clear();
						for (const model of workerContext.getMirrorModels()) {
							modelVersions.set(model, model.version);
						}
						projectVersion++;
						return projectVersion.toString();
					},
					getCompilationSettings() {
						return compilerOptions;
					},
				},
			),
		},
	};
	setup?.({ language, project });

	return new WorkerLanguageService(
		createLanguageService(
			language,
			languageServicePlugins,
			env,
			project,
		),
	);
}

export interface UriComponents {
	scheme: string;
	authority: string;
	path: string;
	query: string;
	fragment: string;
}

export class WorkerLanguageService {
	pendingRequests = new Map<number, undefined | Set<(e: any) => any>>();

	constructor(
		public languageService: LanguageService,
	) {}

	getSemanticTokenLegend() {
		return this.languageService.semanticTokenLegend;
	}
	getCommands() {
		return this.languageService.commands;
	}
	getTriggerCharacters() {
		return this.languageService.triggerCharacters;
	}
	getAutoFormatTriggerCharacters() {
		return this.languageService.autoFormatTriggerCharacters;
	}
	getSignatureHelpTriggerCharacters() {
		return this.languageService.signatureHelpTriggerCharacters;
	}
	getSignatureHelpRetriggerCharacters() {
		return this.languageService.signatureHelpRetriggerCharacters;
	}
	executeCommand(requestId: number, ...args: TrimToken<LanguageService['executeCommand']>) {
		return this.withToken(requestId, token => this.languageService.executeCommand(...args, token));
	}
	getDocumentFormattingEdits(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getDocumentFormattingEdits']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getDocumentFormattingEdits(URI.from(uri), ...restArgs, token),
		);
	}
	getFoldingRanges(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getFoldingRanges']>
	) {
		return this.withToken(requestId, token => this.languageService.getFoldingRanges(URI.from(uri), ...restArgs, token));
	}
	getSelectionRanges(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getSelectionRanges']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getSelectionRanges(URI.from(uri), ...restArgs, token),
		);
	}
	getLinkedEditingRanges(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getLinkedEditingRanges']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getLinkedEditingRanges(URI.from(uri), ...restArgs, token),
		);
	}
	getDocumentSymbols(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getDocumentSymbols']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getDocumentSymbols(URI.from(uri), ...restArgs, token),
		);
	}
	getDocumentColors(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getDocumentColors']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getDocumentColors(URI.from(uri), ...restArgs, token),
		);
	}
	getColorPresentations(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getColorPresentations']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getColorPresentations(URI.from(uri), ...restArgs, token),
		);
	}
	getDiagnostics(requestId: number, uri: UriComponents) {
		return this.withToken(requestId, token => this.languageService.getDiagnostics(URI.from(uri), undefined, token));
	}
	getWorkspaceDiagnostics(requestId: number) {
		return this.withToken(requestId, token => this.languageService.getWorkspaceDiagnostics(token));
	}
	getReferences(requestId: number, uri: UriComponents, ...restArgs: TrimURIAndToken<LanguageService['getReferences']>) {
		return this.withToken(requestId, token => this.languageService.getReferences(URI.from(uri), ...restArgs, token));
	}
	getFileReferences(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getFileReferences']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getFileReferences(URI.from(uri), ...restArgs, token),
		);
	}
	getDefinition(requestId: number, uri: UriComponents, ...restArgs: TrimURIAndToken<LanguageService['getDefinition']>) {
		return this.withToken(requestId, token => this.languageService.getDefinition(URI.from(uri), ...restArgs, token));
	}
	getTypeDefinition(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getTypeDefinition']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getTypeDefinition(URI.from(uri), ...restArgs, token),
		);
	}
	getImplementations(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getImplementations']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getImplementations(URI.from(uri), ...restArgs, token),
		);
	}
	getRenameRange(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getRenameRange']>
	) {
		return this.withToken(requestId, token => this.languageService.getRenameRange(URI.from(uri), ...restArgs, token));
	}
	getRenameEdits(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getRenameEdits']>
	) {
		return this.withToken(requestId, token => this.languageService.getRenameEdits(URI.from(uri), ...restArgs, token));
	}
	getFileRenameEdits(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getFileRenameEdits']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getFileRenameEdits(URI.from(uri), ...restArgs, token),
		);
	}
	getSemanticTokens(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getSemanticTokens']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getSemanticTokens(URI.from(uri), ...restArgs, token),
		);
	}
	getHover(requestId: number, uri: UriComponents, ...restArgs: TrimURIAndToken<LanguageService['getHover']>) {
		return this.withToken(requestId, token => this.languageService.getHover(URI.from(uri), ...restArgs, token));
	}
	getCompletionItems(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getCompletionItems']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getCompletionItems(URI.from(uri), ...restArgs, token),
		);
	}
	getCodeActions(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getCodeActions']>
	) {
		return this.withToken(requestId, token => this.languageService.getCodeActions(URI.from(uri), ...restArgs, token));
	}
	getSignatureHelp(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getSignatureHelp']>
	) {
		return this.withToken(requestId, token => this.languageService.getSignatureHelp(URI.from(uri), ...restArgs, token));
	}
	getCodeLenses(requestId: number, uri: UriComponents, ...restArgs: TrimURIAndToken<LanguageService['getCodeLenses']>) {
		return this.withToken(requestId, token => this.languageService.getCodeLenses(URI.from(uri), ...restArgs, token));
	}
	getDocumentHighlights(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getDocumentHighlights']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getDocumentHighlights(URI.from(uri), ...restArgs, token),
		);
	}
	getDocumentLinks(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getDocumentLinks']>
	) {
		return this.withToken(requestId, token => this.languageService.getDocumentLinks(URI.from(uri), ...restArgs, token));
	}
	getWorkspaceSymbols(requestId: number, ...args: TrimToken<LanguageService['getWorkspaceSymbols']>) {
		return this.withToken(requestId, token => this.languageService.getWorkspaceSymbols(...args, token));
	}
	getAutoInsertSnippet(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getAutoInsertSnippet']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getAutoInsertSnippet(URI.from(uri), ...restArgs, token),
		);
	}
	getDocumentDropEdits(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getDocumentDropEdits']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getDocumentDropEdits(URI.from(uri), ...restArgs, token),
		);
	}
	getInlayHints(requestId: number, uri: UriComponents, ...restArgs: TrimURIAndToken<LanguageService['getInlayHints']>) {
		return this.withToken(requestId, token => this.languageService.getInlayHints(URI.from(uri), ...restArgs, token));
	}
	resolveCodeAction(requestId: number, ...args: TrimToken<LanguageService['resolveCodeAction']>) {
		return this.withToken(requestId, token => this.languageService.resolveCodeAction(...args, token));
	}
	resolveCompletionItem(requestId: number, ...args: TrimToken<LanguageService['resolveCompletionItem']>) {
		return this.withToken(requestId, token => this.languageService.resolveCompletionItem(...args, token));
	}
	resolveCodeLens(requestId: number, ...args: TrimToken<LanguageService['resolveCodeLens']>) {
		return this.withToken(requestId, token => this.languageService.resolveCodeLens(...args, token));
	}
	resolveDocumentLink(requestId: number, ...args: TrimToken<LanguageService['resolveDocumentLink']>) {
		return this.withToken(requestId, token => this.languageService.resolveDocumentLink(...args, token));
	}
	resolveInlayHint(requestId: number, ...args: TrimToken<LanguageService['resolveInlayHint']>) {
		return this.withToken(requestId, token => this.languageService.resolveInlayHint(...args, token));
	}
	resolveWorkspaceSymbol(requestId: number, ...args: TrimToken<LanguageService['resolveWorkspaceSymbol']>) {
		return this.withToken(requestId, token => this.languageService.resolveWorkspaceSymbol(...args, token));
	}
	getCallHierarchyItems(
		requestId: number,
		uri: UriComponents,
		...restArgs: TrimURIAndToken<LanguageService['getCallHierarchyItems']>
	) {
		return this.withToken(
			requestId,
			token => this.languageService.getCallHierarchyItems(URI.from(uri), ...restArgs, token),
		);
	}
	getCallHierarchyIncomingCalls(
		requestId: number,
		...args: TrimToken<LanguageService['getCallHierarchyIncomingCalls']>
	) {
		return this.withToken(requestId, token => this.languageService.getCallHierarchyIncomingCalls(...args, token));
	}
	getCallHierarchyOutgoingCalls(
		requestId: number,
		...args: TrimToken<LanguageService['getCallHierarchyOutgoingCalls']>
	) {
		return this.withToken(requestId, token => this.languageService.getCallHierarchyOutgoingCalls(...args, token));
	}
	dispose() {
		this.languageService.dispose();
	}

	cancelRequest(requestId: number) {
		this.pendingRequests.delete(requestId);
	}

	private async withToken<T>(requestId: number, fn: (token: CancellationToken) => ProviderResult<T>) {
		const { pendingRequests } = this;
		const token: CancellationToken = {
			get isCancellationRequested() {
				return !pendingRequests.has(requestId);
			},
			onCancellationRequested(cb) {
				let callbacks = pendingRequests.get(requestId);
				if (!callbacks) {
					callbacks = new Set();
					pendingRequests.set(requestId, callbacks);
				}
				callbacks.add(cb);
				return {
					dispose() {
						callbacks.delete(cb);
					},
				};
			},
		};
		this.pendingRequests.set(requestId, undefined);
		try {
			return await fn(token);
		}
		finally {
			this.pendingRequests.delete(requestId);
		}
	}
}

type TrimURIAndToken<T> = T extends ((...args: [uri: URI, ...infer U, token: CancellationToken]) => any) ? [...U]
	: never;

type TrimToken<T> = T extends ((...args: [...infer U, token: CancellationToken]) => any) ? [...U] : never;
