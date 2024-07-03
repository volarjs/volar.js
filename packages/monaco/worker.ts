import {
	Language,
	LanguagePlugin,
	LanguageServicePlugin,
	ProjectContext,
	createLanguageService as _createLanguageService,
	createLanguage,
	createLanguageService,
	createUriMap,
	type LanguageService,
	type LanguageServiceEnvironment,
} from '@volar/language-service';
import { createLanguageServiceHost, createSys, resolveFileLanguageId } from '@volar/typescript';
import type * as monaco from 'monaco-types';
import type * as ts from 'typescript';
import { URI } from 'vscode-uri';

export * from '@volar/language-service';

const fsFileSnapshots = createUriMap<[number | undefined, ts.IScriptSnapshot | undefined]>();

/**
 * @deprecated
 * Use `createSimpleWorkerLanguageService` instead.
 */
export const createSimpleWorkerService = createSimpleWorkerLanguageService;

/**
 * @deprecated
 * Use `createTypeScriptWorkerLanguageService` instead.
 */
export const createTypeScriptWorkerService = createTypeScriptWorkerLanguageService;

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
	}): void,
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
		}
	);
	const project: ProjectContext = {};
	setup?.({ language, project });

	return new WorkerLanguageService(
		createLanguageService(
			language,
			languageServicePlugins,
			env,
			project
		)
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
	typescript: typeof import('typescript'),
	compilerOptions: ts.CompilerOptions,
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
	}): void,
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
		uriConverter
	);
	const language = createLanguage<URI>(
		[
			...languagePlugins,
			{ getLanguageId: uri => resolveFileLanguageId(uri.path) },
		],
		createUriMap(sys.useCaseSensitiveFileNames),
		uri => {
			let snapshot = getModelSnapshot(uri);

			if (!snapshot) {
				// fs files
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
		}
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
					getScriptSnapshot(fileName) {
						const uri = uriConverter.asUri(fileName);
						return getModelSnapshot(uri);
					},
					getCompilationSettings() {
						return compilerOptions;
					},
				}
			),
		},
	};
	setup?.({ language, project });

	return new WorkerLanguageService(
		createLanguageService(
			language,
			languageServicePlugins,
			env,
			project
		)
	);

	function getModelSnapshot(uri: URI) {
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
			return modelSnapshot.get(model)?.[1];
		}
	}
}

export interface UriComponents {
	scheme: string;
	authority: string;
	path: string;
	query: string;
	fragment: string;
}

export class WorkerLanguageService {
	constructor(
		private languageService: LanguageService
	) { }

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
	executeCommand(...args: Parameters<LanguageService['executeCommand']>) {
		return this.languageService.executeCommand(...args);
	}
	getDocumentFormattingEdits(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getDocumentFormattingEdits']>) {
		return this.languageService.getDocumentFormattingEdits(URI.from(uri), ...restArgs);
	}
	getFoldingRanges(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getFoldingRanges']>) {
		return this.languageService.getFoldingRanges(URI.from(uri), ...restArgs);
	}
	getSelectionRanges(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getSelectionRanges']>) {
		return this.languageService.getSelectionRanges(URI.from(uri), ...restArgs);
	}
	getLinkedEditingRanges(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getLinkedEditingRanges']>) {
		return this.languageService.getLinkedEditingRanges(URI.from(uri), ...restArgs);
	}
	getDocumentSymbols(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getDocumentSymbols']>) {
		return this.languageService.getDocumentSymbols(URI.from(uri), ...restArgs);
	}
	getDocumentColors(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getDocumentColors']>) {
		return this.languageService.getDocumentColors(URI.from(uri), ...restArgs);
	}
	getColorPresentations(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getColorPresentations']>) {
		return this.languageService.getColorPresentations(URI.from(uri), ...restArgs);
	}
	getDiagnostics(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getDiagnostics']>) {
		return this.languageService.getDiagnostics(URI.from(uri), ...restArgs);
	}
	getWorkspaceDiagnostics(...restArgs: TrimParams<LanguageService['getWorkspaceDiagnostics']>) {
		return this.languageService.getWorkspaceDiagnostics(...restArgs);
	}
	getReferences(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getReferences']>) {
		return this.languageService.getReferences(URI.from(uri), ...restArgs);
	}
	getFileReferences(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getFileReferences']>) {
		return this.languageService.getFileReferences(URI.from(uri), ...restArgs);
	}
	getDefinition(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getDefinition']>) {
		return this.languageService.getDefinition(URI.from(uri), ...restArgs);
	}
	getTypeDefinition(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getTypeDefinition']>) {
		return this.languageService.getTypeDefinition(URI.from(uri), ...restArgs);
	}
	getImplementations(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getImplementations']>) {
		return this.languageService.getImplementations(URI.from(uri), ...restArgs);
	}
	getRenameRange(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getRenameRange']>) {
		return this.languageService.getRenameRange(URI.from(uri), ...restArgs);
	}
	getRenameEdits(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getRenameEdits']>) {
		return this.languageService.getRenameEdits(URI.from(uri), ...restArgs);
	}
	getFileRenameEdits(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getFileRenameEdits']>) {
		return this.languageService.getFileRenameEdits(URI.from(uri), ...restArgs);
	}
	getSemanticTokens(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getSemanticTokens']>) {
		return this.languageService.getSemanticTokens(URI.from(uri), ...restArgs);
	}
	getHover(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getHover']>) {
		return this.languageService.getHover(URI.from(uri), ...restArgs);
	}
	getCompletionItems(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getCompletionItems']>) {
		return this.languageService.getCompletionItems(URI.from(uri), ...restArgs);
	}
	getCodeActions(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getCodeActions']>) {
		return this.languageService.getCodeActions(URI.from(uri), ...restArgs);
	}
	getSignatureHelp(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getSignatureHelp']>) {
		return this.languageService.getSignatureHelp(URI.from(uri), ...restArgs);
	}
	getCodeLenses(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getCodeLenses']>) {
		return this.languageService.getCodeLenses(URI.from(uri), ...restArgs);
	}
	getDocumentHighlights(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getDocumentHighlights']>) {
		return this.languageService.getDocumentHighlights(URI.from(uri), ...restArgs);
	}
	getDocumentLinks(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getDocumentLinks']>) {
		return this.languageService.getDocumentLinks(URI.from(uri), ...restArgs);
	}
	getWorkspaceSymbols(...args: Parameters<LanguageService['getWorkspaceSymbols']>) {
		return this.languageService.getWorkspaceSymbols(...args);
	}
	getAutoInsertSnippet(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getAutoInsertSnippet']>) {
		return this.languageService.getAutoInsertSnippet(URI.from(uri), ...restArgs);
	}
	getDocumentDropEdits(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getDocumentDropEdits']>) {
		return this.languageService.getDocumentDropEdits(URI.from(uri), ...restArgs);
	}
	getInlayHints(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getInlayHints']>) {
		return this.languageService.getInlayHints(URI.from(uri), ...restArgs);
	}
	resolveCodeAction(...args: Parameters<LanguageService['resolveCodeAction']>) {
		return this.languageService.resolveCodeAction(...args);
	}
	resolveCompletionItem(...args: Parameters<LanguageService['resolveCompletionItem']>) {
		return this.languageService.resolveCompletionItem(...args);
	}
	resolveCodeLens(...args: Parameters<LanguageService['resolveCodeLens']>) {
		return this.languageService.resolveCodeLens(...args);
	}
	resolveDocumentLink(...args: Parameters<LanguageService['resolveDocumentLink']>) {
		return this.languageService.resolveDocumentLink(...args);
	}
	resolveInlayHint(...args: Parameters<LanguageService['resolveInlayHint']>) {
		return this.languageService.resolveInlayHint(...args);
	}
	resolveWorkspaceSymbol(...args: Parameters<LanguageService['resolveWorkspaceSymbol']>) {
		return this.languageService.resolveWorkspaceSymbol(...args);
	}
	getCallHierarchyItems(uri: UriComponents, ...restArgs: TrimParams<LanguageService['getCallHierarchyItems']>) {
		return this.languageService.getCallHierarchyItems(URI.from(uri), ...restArgs);
	}
	getCallHierarchyIncomingCalls(...args: Parameters<LanguageService['getCallHierarchyIncomingCalls']>) {
		return this.languageService.getCallHierarchyIncomingCalls(...args);
	}
	getCallHierarchyOutgoingCalls(...args: Parameters<LanguageService['getCallHierarchyOutgoingCalls']>) {
		return this.languageService.getCallHierarchyOutgoingCalls(...args);
	}
	dispose() {
		this.languageService.dispose();
	}
}

type TrimParams<T> = T extends ((...args: [any, ...infer U]) => any) ? U : never;
