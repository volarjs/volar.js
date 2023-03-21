import { LanguageContext, LanguageModule, LanguageServiceHost } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import type { DocumentContext, FileSystemProvider } from 'vscode-html-languageservice';
import type { SchemaRequestService } from 'vscode-json-languageservice';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { DocumentsAndSourceMaps } from './documents';

export * from 'vscode-languageserver-protocol';

export interface LanguageServiceOptions {
	// InitializeParams
	locale?: string;
	rootUri: URI;
	capabilities?: vscode.ClientCapabilities;

	host: LanguageServiceHost;
	config: Config;
	uriToFileName(uri: string): string;
	fileNameToUri(fileName: string): string;
	configurationHost?: ConfigurationHost;
	documentContext?: DocumentContext;
	fileSystemProvider?: FileSystemProvider;
	schemaRequestService?: SchemaRequestService;
}

export interface Commands {
	createShowReferencesCommand(uri: string, position: vscode.Position, locations: vscode.Location[]): vscode.Command | undefined;
	createRenameCommand(uri: string, position: vscode.Position): vscode.Command | undefined;
	createSetSelectionCommand(position: vscode.Position): vscode.Command | undefined;
}

export interface LanguageServicePluginContext extends LanguageServiceOptions {

	typescript: {
		module: typeof import('typescript/lib/tsserverlibrary');
		languageServiceHost: ts.LanguageServiceHost;
		languageService: ts.LanguageService;
	} | undefined;
	commands: Commands;

	/** @private */
	core: LanguageContext;
	/** @private */
	documents: DocumentsAndSourceMaps;
	/** @private */
	plugins: { [id: string]: LanguageServicePluginInstance; };
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

export interface ConfigurationHost {
	getConfiguration: (<T> (section: string, scopeUri?: string) => Promise<T | undefined>),
	onDidChangeConfiguration: (cb: () => void) => void,
}

/**
 * LanguageServicePlugin
 */

export type Result<T> = T | Thenable<T>;
export type NullableResult<T> = Result<T | undefined | null>;
export type SemanticToken = [number, number, number, number, number];

export interface LanguageServicePlugin {
	(context?: LanguageServicePluginContext): LanguageServicePluginInstance;
}

export interface AutoInsertionContext {
	lastChange: {
		range: vscode.Range;
		rangeOffset: number;
		rangeLength: number;
		text: string;
	};
}

export interface LanguageServicePluginInstance {
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
	provideLinks?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.DocumentLink[]>;
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
	provideSyntacticDiagnostics?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.Diagnostic[]>;
	provideSemanticDiagnostics?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.Diagnostic[]>;
	provideFileReferences?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.Location[]>; // volar specific
	provideReferencesCodeLensRanges?(document: TextDocument, token: vscode.CancellationToken): NullableResult<vscode.Range[]>; // volar specific
	provideAutoInsertionEdit?(document: TextDocument, position: vscode.Position, context: AutoInsertionContext, token: vscode.CancellationToken): NullableResult<string | vscode.TextEdit>; // volar specific
	provideFileRenameEdits?(oldUri: string, newUri: string, token: vscode.CancellationToken): NullableResult<vscode.WorkspaceEdit>; // volar specific
	provideFormattingIndentSensitiveLines?(document: TextDocument, token: vscode.CancellationToken): NullableResult<number[]>; // volar specific
	resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): Result<vscode.CodeLens>;
	resolveCodeAction?(codeAction: vscode.CodeAction, token: vscode.CancellationToken): Result<vscode.CodeAction>;
	resolveCompletionItem?(item: vscode.CompletionItem, token: vscode.CancellationToken): Result<vscode.CompletionItem>,
	resolveReferencesCodeLensLocations?(document: TextDocument, range: vscode.Range, references: vscode.Location[], token: vscode.CancellationToken): Result<vscode.Location[]>; // volar specific
	resolveRuleContext?(context: RuleContext, ruleType: 'format' | 'syntax' | 'semantic'): Result<RuleContext>; // volar specific
	resolveEmbeddedRange?(range: vscode.Range): vscode.Range | undefined; // volar specific, only support in resolveCompletionItem for now
	// resolveLink
	// resolveInlayHint
}

export interface Rule {
	onFormat?(ctx: RuleContext): void;
	onSyntax?(ctx: RuleContext): void;
	onSemantic?(ctx: RuleContext): void;
}

export interface RuleContext {
	/**
	 * Shared modules.
	 */
	modules: {
		typescript?: typeof import('typescript/lib/tsserverlibrary');
	},
	/**
	 * IDE or user define locale.
	 * You can use it to localize your rule.
	 */
	locale?: string;
	/**
	 * Project root path.
	 */
	rootUri: URI;
	uriToFileName(uri: string): string;
	fileNameToUri(fileName: string): string;
	/**
	 * Get configuration from IDE.
	 * 
	 * For VSCode, it's .vscode/settings.json
	 */
	getConfiguration?: <T> (section: string) => Promise<T | undefined>;
	onDidChangeConfiguration?: (cb: () => void) => void;
	/**
	 * Global settings from config.
	 */
	settings: any;
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
	languages?: { [id: string]: LanguageModule | undefined; };
	plugins?: { [id: string]: LanguageServicePlugin | LanguageServicePluginInstance | undefined; };
	lint?: {
		rules?: { [id: string]: Rule | undefined; };
		severities?: { [id: string]: vscode.DiagnosticSeverity; };
		settings?: any;
	};
}
