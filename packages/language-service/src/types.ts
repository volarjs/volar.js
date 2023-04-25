import { LanguageContext, Language as Language, LanguageServiceHost } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import type { DocumentContext, FileSystemProvider } from 'vscode-html-languageservice';
import type { SchemaRequestService } from 'vscode-json-languageservice';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { DocumentsAndSourceMaps } from './documents';

export * from 'vscode-languageserver-protocol';

export interface ServiceEnvironment {
	// InitializeParams
	locale?: string;
	rootUri: URI;
	clientCapabilities?: vscode.ClientCapabilities;
	host: LanguageServiceHost;
	config: Config;
	uriToFileName(uri: string): string;
	fileNameToUri(fileName: string): string;
	getConfiguration?<T>(section: string, scopeUri?: string): Promise<T | undefined>,
	onDidChangeConfiguration?(cb: () => void): void,
	onDidChangeWatchedFiles?(cb: (params: vscode.DidChangeWatchedFilesParams) => void): () => void,
	documentContext?: DocumentContext;
	fileSystemProvider?: FileSystemProvider;
	schemaRequestService?: SchemaRequestService;
}

interface Command<T> {
	create: T;
	is(value: vscode.Command): boolean;
}

export interface ServiceContext {

	env: ServiceEnvironment;

	typescript: {
		languageServiceHost: ts.LanguageServiceHost;
		languageService: ts.LanguageService;
	} | undefined;

	commands: {
		showReferences: Command<(uri: string, position: vscode.Position, locations: vscode.Location[]) => vscode.Command | undefined>;
		rename: Command<(uri: string, position: vscode.Position) => vscode.Command | undefined>;
		setSelection: Command<(position: vscode.Position) => vscode.Command | undefined>;
	};

	/** @private */
	core: LanguageContext;
	/** @private */
	documents: DocumentsAndSourceMaps;
	/** @private */
	plugins: { [id: string]: ReturnType<Service>; };
	/** @private */
	getTextDocument(uri: string): TextDocument | undefined;
	/** @private */
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

export interface Service {
	(context: ServiceContext | undefined, modules: { typescript?: typeof import('typescript/lib/tsserverlibrary'); } | undefined): {
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
		provideRenameRange?(document: TextDocument, position: vscode.Position, token: vscode.CancellationToken): NullableResult<vscode.Range | vscode.ResponseError<void>>;
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
		resolveRuleContext?(context: RuleContext, ruleType: 'format' | 'syntax' | 'semantic'): Result<RuleContext>; // volar specific
		resolveEmbeddedRange?(range: vscode.Range): vscode.Range | undefined; // volar specific, only support in resolveCompletionItem for now
	};
}

export interface AutoInsertionContext {
	lastChange: {
		range: vscode.Range;
		rangeOffset: number;
		rangeLength: number;
		text: string;
	};
}

export interface Rule {
	onFormat?(ctx: RuleContext): void;
	onSyntax?(ctx: RuleContext): void;
	onSemantic?(ctx: RuleContext): void;
}

export interface RuleContext {
	env: ServiceEnvironment;
	ruleId: string;
	document: TextDocument;
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
	languages?: { [id: string]: Language | undefined; };
	services?: { [id: string]: Service | undefined; };
	lint?: {
		rules?: { [id: string]: Rule | undefined; };
		severities?: { [id: string]: vscode.DiagnosticSeverity; };
		settings?: any;
	};
}
