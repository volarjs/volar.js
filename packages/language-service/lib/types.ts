import type { LanguageContext, VirtualCode } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { DocumentProvider } from './documents';

export type * from 'vscode-languageserver-protocol';

export interface ServiceEnvironment {
	workspaceFolder: string;
	typescript?: {
		uriToFileName(uri: string): string;
		fileNameToUri(fileName: string): string;
	};
	locale?: string;
	clientCapabilities?: vscode.ClientCapabilities;
	fs?: FileSystem;
	console?: Console;
	getConfiguration?<T>(section: string, scopeUri?: string): Promise<T | undefined>;
	onDidChangeConfiguration?(cb: () => void): vscode.Disposable;
	onDidChangeWatchedFiles?(cb: (params: vscode.DidChangeWatchedFilesParams) => void): vscode.Disposable;
}

export interface FileSystem {
	stat(uri: string): ProviderResult<FileStat | undefined>;
	readDirectory(uri: string): ProviderResult<[string, FileType][]>;
	readFile(uri: string, encoding?: string): ProviderResult<string | undefined>;
}

export interface FileStat {
	type: FileType;
	ctime: number;
	mtime: number;
	size: number;
}

export enum FileType {
	Unknown = 0,
	File = 1,
	Directory = 2,
	SymbolicLink = 64,
}

export interface ServiceCommand<T extends any[]> {
	create(...args: T): vscode.Command | undefined;
	is(value: vscode.Command): boolean;
}

export interface ServiceContext {
	language: LanguageContext;
	env: ServiceEnvironment;
	inject<Provide, K extends keyof Provide = keyof Provide>(
		key: K,
		...args: Provide[K] extends (...args: any) => any ? Parameters<Provide[K]> : never
	): ReturnType<Provide[K] extends (...args: any) => any ? Provide[K] : never>;
	commands: {
		showReferences: ServiceCommand<[uri: string, position: vscode.Position, locations: vscode.Location[]]>;
		rename: ServiceCommand<[uri: string, position: vscode.Position]>;
		setSelection: ServiceCommand<[position: vscode.Position]>;
	};
	documents: DocumentProvider;
	services: [ServicePlugin, ServicePluginInstance][];
	disabledEmbeddedContentUris: Set<string>;
	disabledServicePlugins: WeakSet<ServicePluginInstance>;
}

export type ProviderResult<T> = T | Thenable<T>;
export type NullableProviderResult<T> = ProviderResult<T | undefined | null>;
export type SemanticToken = [number, number, number, number, number];

export interface ServicePlugin<P = any> {
	name?: string;
	triggerCharacters?: string[];
	signatureHelpTriggerCharacters?: string[];
	signatureHelpRetriggerCharacters?: string[];
	autoFormatTriggerCharacters?: string[];
	create(context: ServiceContext): ServicePluginInstance<P>;
}

export interface EmbeddedCodeFormattingOptions {
	level: number;
	initialIndentLevel: number;
}

export interface ServicePluginInstance<P = any> {
	provide?: P;
	isAdditionalCompletion?: boolean; // volar specific
	provideHover?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableProviderResult<vscode.Hover>;
	provideDocumentSymbols?(document: TextDocument, token: vscode.CancellationToken): NullableProviderResult<vscode.DocumentSymbol[]>;
	provideDocumentHighlights?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableProviderResult<vscode.DocumentHighlight[]>;
	provideLinkedEditingRanges?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableProviderResult<vscode.LinkedEditingRanges>;
	provideDefinition?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableProviderResult<vscode.LocationLink[]>;
	provideTypeDefinition?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableProviderResult<vscode.LocationLink[]>;
	provideImplementation?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableProviderResult<vscode.LocationLink[]>;
	provideCodeLenses?(document: TextDocument, token: vscode.CancellationToken): NullableProviderResult<vscode.CodeLens[]>;
	provideCodeActions?(document: TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): NullableProviderResult<vscode.CodeAction[]>;
	provideDocumentFormattingEdits?(document: TextDocument, range: vscode.Range, options: vscode.FormattingOptions, embeddedCodeContext: EmbeddedCodeFormattingOptions | undefined, token: vscode.CancellationToken): NullableProviderResult<vscode.TextEdit[]>;
	provideOnTypeFormattingEdits?(document: TextDocument, position: vscode.Position, key: string, options: vscode.FormattingOptions, embeddedCodeContext: EmbeddedCodeFormattingOptions | undefined, token: vscode.CancellationToken): NullableProviderResult<vscode.TextEdit[]>;
	provideDocumentLinks?(document: TextDocument, token: vscode.CancellationToken): NullableProviderResult<vscode.DocumentLink[]>;
	provideCompletionItems?(document: TextDocument, position: vscode.Position, context: vscode.CompletionContext, token: vscode.CancellationToken): NullableProviderResult<vscode.CompletionList>;
	provideDocumentColors?(document: TextDocument, token: vscode.CancellationToken): NullableProviderResult<vscode.ColorInformation[]>;
	provideColorPresentations?(document: TextDocument, color: vscode.Color, range: vscode.Range, token: vscode.CancellationToken): NullableProviderResult<vscode.ColorPresentation[]>;
	provideFoldingRanges?(document: TextDocument, token: vscode.CancellationToken): NullableProviderResult<vscode.FoldingRange[]>;
	provideSignatureHelp?(document: TextDocument, position: vscode.Position, context: vscode.SignatureHelpContext, token: vscode.CancellationToken): NullableProviderResult<vscode.SignatureHelp>;
	provideRenameRange?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableProviderResult<vscode.Range | { range: vscode.Range; placeholder: string; } | { message: string; }>;
	provideRenameEdits?(document: TextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): NullableProviderResult<vscode.WorkspaceEdit>;
	provideReferences?(document: TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): NullableProviderResult<vscode.Location[]>;
	provideSelectionRanges?(document: TextDocument, positions: vscode.Position[], token: vscode.CancellationToken): NullableProviderResult<vscode.SelectionRange[]>;
	provideInlayHints?(document: TextDocument, range: vscode.Range, token: vscode.CancellationToken): NullableProviderResult<vscode.InlayHint[]>;
	provideCallHierarchyItems?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableProviderResult<vscode.CallHierarchyItem[]>;
	provideCallHierarchyIncomingCalls?(item: vscode.CallHierarchyItem, token: vscode.CancellationToken): ProviderResult<vscode.CallHierarchyIncomingCall[]>;
	provideCallHierarchyOutgoingCalls?(item: vscode.CallHierarchyItem, token: vscode.CancellationToken): ProviderResult<vscode.CallHierarchyOutgoingCall[]>;
	provideDocumentSemanticTokens?(document: TextDocument, range: vscode.Range, legend: vscode.SemanticTokensLegend, token: vscode.CancellationToken): NullableProviderResult<SemanticToken[]>;
	provideWorkspaceSymbols?(query: string, token: vscode.CancellationToken): NullableProviderResult<vscode.WorkspaceSymbol[]>;
	provideDiagnostics?(document: TextDocument, token: vscode.CancellationToken): NullableProviderResult<vscode.Diagnostic[]>;
	provideSemanticDiagnostics?(document: TextDocument, token: vscode.CancellationToken): NullableProviderResult<vscode.Diagnostic[]>;
	provideFileReferences?(document: TextDocument, token: vscode.CancellationToken): NullableProviderResult<vscode.Location[]>; // volar specific
	provideReferencesCodeLensRanges?(document: TextDocument, token: vscode.CancellationToken): NullableProviderResult<vscode.Range[]>; // volar specific
	provideAutoInsertionEdit?(document: TextDocument, position: vscode.Position, lastChange: { range: vscode.Range; text: string; }, token: vscode.CancellationToken): NullableProviderResult<string | vscode.TextEdit>; // volar specific
	provideFileRenameEdits?(oldUri: string, newUri: string, token: vscode.CancellationToken): NullableProviderResult<vscode.WorkspaceEdit>; // volar specific
	provideDocumentDropEdits?(document: TextDocument, position: vscode.Position, dataTransfer: Map<string, DataTransferItem>, token: vscode.CancellationToken): NullableProviderResult<DocumentDropEdit>; // volar specific
	resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): ProviderResult<vscode.CodeLens>;
	resolveCodeAction?(codeAction: vscode.CodeAction, token: vscode.CancellationToken): ProviderResult<vscode.CodeAction>;
	resolveCompletionItem?(item: vscode.CompletionItem, token: vscode.CancellationToken): ProviderResult<vscode.CompletionItem>;
	resolveDocumentLink?(link: vscode.DocumentLink, token: vscode.CancellationToken): ProviderResult<vscode.DocumentLink>;
	resolveInlayHint?(inlayHint: vscode.InlayHint, token: vscode.CancellationToken): ProviderResult<vscode.InlayHint>;
	resolveEmbeddedCodeFormattingOptions?(code: VirtualCode, options: EmbeddedCodeFormattingOptions, token: vscode.CancellationToken): NullableProviderResult<EmbeddedCodeFormattingOptions>; // volar specific
	transformCompletionItem?(item: vscode.CompletionItem): vscode.CompletionItem | undefined; // volar specific
	transformCodeAction?(item: vscode.CodeAction): vscode.CodeAction | undefined; // volar specific
	dispose?(): void;
}

export interface DocumentDropEdit {
	insertText: string;
	insertTextFormat: vscode.InsertTextFormat;
	additionalEdit?: vscode.WorkspaceEdit;
	createDataTransferFile?: (vscode.CreateFile & { contentsMimeType: string; })[];
}

export interface DataTransferItem {
	value: any;
	asString(): Thenable<string>;
	asFile(): DataTransferFile | undefined;
}

export interface DataTransferFile {
	name: string;
	uri?: string;
	data(): Thenable<Uint8Array>;
}
