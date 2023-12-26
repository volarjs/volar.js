import type { Language } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { URI } from 'vscode-uri';
import type { DocumentProvider } from './documents';

export type * from 'vscode-languageserver-protocol';

export interface ServiceEnvironment extends RuntimeEnvironment {
	workspaceFolder: URI;
	locale?: string;
	clientCapabilities?: vscode.ClientCapabilities;
	getConfiguration?<T>(section: string, scopeUri?: string): Promise<T | undefined>;
	onDidChangeConfiguration?(cb: () => void): vscode.Disposable;
	onDidChangeWatchedFiles?(cb: (params: vscode.DidChangeWatchedFilesParams) => void): vscode.Disposable;
}

export interface RuntimeEnvironment {
	uriToFileName(uri: string): string;
	fileNameToUri(fileName: string): string;
	fs?: FileSystem;
	console?: Console;
}

export interface Console {
	error(message: string): void;
	info(message: string): void;
	log(message: string): void;
	warn(message: string): void;
}

export interface FileSystem {
	stat(uri: string): Result<FileStat | undefined>;
	readDirectory(uri: string): Result<[string, FileType][]>;
	readFile(uri: string, encoding?: string): Result<string | undefined>;
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
	env: ServiceEnvironment;
	language: Language;
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
	disabledVirtualFiles: Set<string>;
	disabledServicePlugins: WeakSet<ServicePluginInstance>;
}

export type Result<T> = T | Thenable<T>;
export type NullableResult<T> = Result<T | undefined | null>;
export type SemanticToken = [number, number, number, number, number];

export interface ServicePlugin {
	name?: string;
	triggerCharacters?: string[];
	signatureHelpTriggerCharacters?: string[];
	signatureHelpRetriggerCharacters?: string[];
	autoFormatTriggerCharacters?: string[];
	create(context: ServiceContext): ServicePluginInstance;
}

export interface ServicePluginInstance<P = any> {
	provide?: P;
	isAdditionalCompletion?: boolean; // volar specific
	provideHover?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableResult<vscode.Hover>;
	provideDocumentSymbols?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.DocumentSymbol[]>;
	provideDocumentHighlights?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableResult<vscode.DocumentHighlight[]>;
	provideLinkedEditingRanges?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableResult<vscode.LinkedEditingRanges>;
	provideDefinition?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableResult<vscode.LocationLink[]>;
	provideTypeDefinition?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableResult<vscode.LocationLink[]>;
	provideImplementation?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableResult<vscode.LocationLink[]>;
	provideCodeLenses?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.CodeLens[]>;
	provideCodeActions?(document: TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): NullableResult<vscode.CodeAction[]>;
	provideDocumentFormattingEdits?(document: TextDocument, range: vscode.Range, options: vscode.FormattingOptions, token: vscode.CancellationToken): NullableResult<vscode.TextEdit[]>;
	provideOnTypeFormattingEdits?(document: TextDocument, position: vscode.Position, key: string, options: vscode.FormattingOptions, token: vscode.CancellationToken): NullableResult<vscode.TextEdit[]>;
	provideDocumentLinks?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.DocumentLink[]>;
	provideCompletionItems?(document: TextDocument, position: vscode.Position, context: vscode.CompletionContext, token: vscode.CancellationToken): NullableResult<vscode.CompletionList>;
	provideDocumentColors?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.ColorInformation[]>;
	provideColorPresentations?(document: TextDocument, color: vscode.Color, range: vscode.Range, token: vscode.CancellationToken): NullableResult<vscode.ColorPresentation[]>;
	provideFoldingRanges?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.FoldingRange[]>;
	provideSignatureHelp?(document: TextDocument, position: vscode.Position, context: vscode.SignatureHelpContext, token: vscode.CancellationToken): NullableResult<vscode.SignatureHelp>;
	provideRenameRange?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableResult<vscode.Range | { range: vscode.Range; placeholder: string; } | { message: string; }>;
	provideRenameEdits?(document: TextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): NullableResult<vscode.WorkspaceEdit>;
	provideReferences?(document: TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): NullableResult<vscode.Location[]>;
	provideSelectionRanges?(document: TextDocument, positions: vscode.Position[], token: vscode.CancellationToken): NullableResult<vscode.SelectionRange[]>;
	provideInlayHints?(document: TextDocument, range: vscode.Range, token: vscode.CancellationToken): NullableResult<vscode.InlayHint[]>;
	provideCallHierarchyItems?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableResult<vscode.CallHierarchyItem[]>;
	provideCallHierarchyIncomingCalls?(item: vscode.CallHierarchyItem, token: vscode.CancellationToken): Result<vscode.CallHierarchyIncomingCall[]>;
	provideCallHierarchyOutgoingCalls?(item: vscode.CallHierarchyItem, token: vscode.CancellationToken): Result<vscode.CallHierarchyOutgoingCall[]>;
	provideDocumentSemanticTokens?(document: TextDocument, range: vscode.Range, legend: vscode.SemanticTokensLegend, token: vscode.CancellationToken): NullableResult<SemanticToken[]>;
	provideWorkspaceSymbols?(query: string, token: vscode.CancellationToken): NullableResult<vscode.WorkspaceSymbol[]>;
	provideDiagnostics?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.Diagnostic[]>;
	provideSemanticDiagnostics?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.Diagnostic[]>;
	provideDiagnosticMarkupContent?(diagnostic: vscode.Diagnostic, token: vscode.CancellationToken): NullableResult<vscode.MarkupContent>;
	provideFileReferences?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.Location[]>; // volar specific
	provideReferencesCodeLensRanges?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.Range[]>; // volar specific
	provideAutoInsertionEdit?(document: TextDocument, position: vscode.Position, lastChange: { range: vscode.Range; text: string; }, token: vscode.CancellationToken): NullableResult<string | vscode.TextEdit>; // volar specific
	provideFileRenameEdits?(oldUri: string, newUri: string, token: vscode.CancellationToken): NullableResult<vscode.WorkspaceEdit>; // volar specific
	provideFormattingIndentSensitiveLines?(document: TextDocument, token: vscode.CancellationToken): NullableResult<number[]>; // volar specific
	provideDocumentDropEdits?(document: TextDocument, position: vscode.Position, dataTransfer: Map<string, DataTransferItem>, token: vscode.CancellationToken): NullableResult<DocumentDropEdit>; // volar specific
	resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): Result<vscode.CodeLens>;
	resolveCodeAction?(codeAction: vscode.CodeAction, token: vscode.CancellationToken): Result<vscode.CodeAction>;
	resolveCompletionItem?(item: vscode.CompletionItem, token: vscode.CancellationToken): Result<vscode.CompletionItem>;
	resolveDocumentLink?(link: vscode.DocumentLink, token: vscode.CancellationToken): Result<vscode.DocumentLink>;
	resolveInlayHint?(inlayHint: vscode.InlayHint, token: vscode.CancellationToken): Result<vscode.InlayHint>;
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
