import { Language, LanguageContext } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { DocumentsAndSourceMaps } from './documents';

export type * from 'vscode-languageserver-protocol';

export interface SharedModules {
	typescript?: typeof import('typescript/lib/tsserverlibrary');
}

export interface ServiceEnvironment {

	locale?: string;
	rootUri: URI;
	clientCapabilities?: vscode.ClientCapabilities;
	getConfiguration?<T>(section: string, scopeUri?: string): Promise<T | undefined>;
	onDidChangeConfiguration?(cb: () => void): vscode.Disposable;
	onDidChangeWatchedFiles?(cb: (params: vscode.DidChangeWatchedFilesParams) => void): vscode.Disposable;

	// RuntimeEnvironment
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

interface Command<T> {
	create: T;
	is(value: vscode.Command): boolean;
}

export interface ServiceContext<Provide = any> extends LanguageContext {
	env: ServiceEnvironment;
	inject<K extends keyof Provide>(key: K, ...args: Provide[K] extends (...args: any) => any ? Parameters<Provide[K]> : never): ReturnType<Provide[K] extends (...args: any) => any ? Provide[K] : never>;
	getTextDocument(uri: string): TextDocument | undefined;
	commands: {
		showReferences: Command<(uri: string, position: vscode.Position, locations: vscode.Location[]) => vscode.Command | undefined>;
		rename: Command<(uri: string, position: vscode.Position) => vscode.Command | undefined>;
		setSelection: Command<(position: vscode.Position) => vscode.Command | undefined>;
	};
	documents: DocumentsAndSourceMaps;
	rules: { [id: string]: Rule; };
	services: { [id: string]: ReturnType<Service>; };
	ruleFixes?: {
		[uri: string]: {
			[ruleId: string]: {
				[ruleFixId: number]: [vscode.Diagnostic, RuleFix[]];
			};
		};
	};
}

export type Result<T> = T | Thenable<T>;
export type NullableResult<T> = Result<T | undefined | null>;
export type SemanticToken = [number, number, number, number, number];

type ServiceProvide<P> = P extends undefined ? { provide?: undefined; } : { provide: P; };

export type Service<P = any> = {
	(context: ServiceContext | undefined, modules: SharedModules | undefined): {
		isAdditionalCompletion?: boolean; // volar specific
		triggerCharacters?: string[];
		signatureHelpTriggerCharacters?: string[];
		signatureHelpRetriggerCharacters?: string[];
		autoFormatTriggerCharacters?: string[];
		provideHover?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableResult<vscode.Hover>,
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
		provideCompletionItems?(document: TextDocument, position: vscode.Position, context: vscode.CompletionContext, token: vscode.CancellationToken): NullableResult<vscode.CompletionList>,
		provideDocumentColors?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.ColorInformation[]>;
		provideColorPresentations?(document: TextDocument, color: vscode.Color, range: vscode.Range, token: vscode.CancellationToken): NullableResult<vscode.ColorPresentation[]>;
		provideFoldingRanges?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.FoldingRange[]>;
		provideSignatureHelp?(document: TextDocument, position: vscode.Position, context: vscode.SignatureHelpContext, token: vscode.CancellationToken): NullableResult<vscode.SignatureHelp>;
		provideRenameRange?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableResult<vscode.Range | { range: vscode.Range; placeholder: string; } | { message: string; }>;
		provideRenameEdits?(document: TextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): NullableResult<vscode.WorkspaceEdit>;
		provideReferences?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableResult<vscode.Location[]>;
		provideSelectionRanges?(document: TextDocument, positions: vscode.Position[], token: vscode.CancellationToken): NullableResult<vscode.SelectionRange[]>;
		provideInlayHints?(document: TextDocument, range: vscode.Range, token: vscode.CancellationToken): NullableResult<vscode.InlayHint[]>,
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
		provideAutoInsertionEdit?(document: TextDocument, position: vscode.Position, context: AutoInsertionContext, token: vscode.CancellationToken): NullableResult<string | vscode.TextEdit>; // volar specific
		provideFileRenameEdits?(oldUri: string, newUri: string, token: vscode.CancellationToken): NullableResult<vscode.WorkspaceEdit>; // volar specific
		provideFormattingIndentSensitiveLines?(document: TextDocument, token: vscode.CancellationToken): NullableResult<number[]>; // volar specific
		resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): Result<vscode.CodeLens>;
		resolveCodeAction?(codeAction: vscode.CodeAction, token: vscode.CancellationToken): Result<vscode.CodeAction>;
		resolveCompletionItem?(item: vscode.CompletionItem, token: vscode.CancellationToken): Result<vscode.CompletionItem>,
		resolveDocumentLink?(link: vscode.DocumentLink, token: vscode.CancellationToken): Result<vscode.DocumentLink>;
		resolveInlayHint?(inlayHint: vscode.InlayHint, token: vscode.CancellationToken): Result<vscode.InlayHint>;
		resolveReferencesCodeLensLocations?(document: TextDocument, range: vscode.Range, references: vscode.Location[], token: vscode.CancellationToken): Result<vscode.Location[]>; // volar specific
		transformCompletionItem?(item: vscode.CompletionItem): vscode.CompletionItem | undefined; // volar specific
		transformCodeAction?(item: vscode.CodeAction): vscode.CodeAction | undefined; // volar specific
		dispose?(): void;
	} & ServiceProvide<P>;
};

export interface AutoInsertionContext {
	lastChange: {
		range: vscode.Range;
		rangeOffset: number;
		rangeLength: number;
		text: string;
	};
}

export enum RuleType {
	Format,
	Syntax,
	Semantic,
};

export interface Rule<Provide = any> {
	type?: RuleType;
	run(document: TextDocument, ctx: RuleContext<Provide>): void;
}

export interface RuleContext<Provide = any> {
	env: ServiceEnvironment;
	inject<K extends keyof Provide>(key: K, ...args: Provide[K] extends (...args: any) => any ? Parameters<Provide[K]> : never): ReturnType<Provide[K] extends (...args: any) => any ? Provide[K] : never>;
	report(error: vscode.Diagnostic, ...fixes: RuleFix[]): void;
}

export interface RuleFix {
	/**
	 * Code action kind, like `quickfix` or `refactor`.
	 * 
	 * See https://code.visualstudio.com/api/references/vscode-api#CodeActionKind
	 */
	kinds?: vscode.CodeActionKind[];
	/**
	 * Title of the code action.
	 */
	title?: string;
	/**
	 * Edit to apply to the document.
	 */
	getEdits?(diagnostic: vscode.Diagnostic): NullableResult<vscode.TextEdit[]>;
	/**
	 * Cross-file edits to apply to the workspace.
	 */
	getWorkspaceEdit?(diagnostic: vscode.Diagnostic): NullableResult<vscode.WorkspaceEdit>;
}

export interface Config {
	languages?: { [id: string]: Language; };
	services?: { [id: string]: Service; };
	rules?: { [id: string]: Rule; };
}
