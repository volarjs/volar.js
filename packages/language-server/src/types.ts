import * as embeddedLS from '@volar/language-service';
import * as embedded from '@volar/language-core';
import type { FileSystemProvider } from 'vscode-html-languageservice';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { Config, LanguageServicePluginContext } from '@volar/language-service';
import { ProjectContext } from './common/project';

export type FileSystemHost = {
	ready(connection: vscode.Connection): void,
	reload(): void,
	getWorkspaceFileSystem(rootUri: URI): FileSystem,
	onDidChangeWatchedFiles(cb: (params: vscode.DidChangeWatchedFilesParams) => void): () => void,
};

export type FileSystem = Pick<ts.System,
	'newLine'
	| 'useCaseSensitiveFileNames'
	| 'fileExists'
	| 'readFile'
	| 'readDirectory'
	| 'getCurrentDirectory'
	| 'realpath'
	| 'resolvePath'
> & Partial<ts.System>;

export interface RuntimeEnvironment {
	loadTypescript: (tsdk: string) => typeof import('typescript/lib/tsserverlibrary'),
	loadTypescriptLocalized: (tsdk: string, locale: string) => Promise<{} | undefined>,
	schemaRequestHandlers: { [schema: string]: (uri: string, encoding?: BufferEncoding) => Promise<string>; },
	onDidChangeConfiguration?: (settings: any) => void,
	fileSystemProvide: FileSystemProvider | undefined,
	createFileSystemHost: (
		ts: typeof import('typescript/lib/tsserverlibrary'),
		capabilities: vscode.ClientCapabilities,
	) => FileSystemHost,
	// https://github.com/microsoft/vscode/blob/7927075f89db213bc6e2182fa684d514d69e2359/extensions/html-language-features/server/src/htmlServer.ts#L53-L56
	readonly timer: {
		setImmediate(callback: (...args: any[]) => void, ...args: any[]): vscode.Disposable;
		// Seems not useful
		// setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): vscode.Disposable;
	};
}

export interface LanguageServiceContext {
	project: ProjectContext;
	env: LanguageServicePluginContext['env'];
	host: embedded.LanguageServiceHost;
	sys: FileSystem;
}

export type LanguageServerPlugin<
	A extends LanguageServerInitializationOptions = LanguageServerInitializationOptions,
	C = embeddedLS.LanguageService
> = (initOptions: A) => {
	tsconfigExtraFileExtensions: ts.FileExtensionInfo[];
	diagnosticDocumentSelector: vscode.DocumentSelector;
	extensions: {
		fileRenameOperationFilter: string[];
		fileWatcher: string[];
	},
	resolveConfig?(config: Config, ctx: LanguageServiceContext): void;
	onInitialize?(_: vscode.InitializeResult): void;
	onInitialized?(getLanguageService: (uri: string) => Promise<C>): void;
};

export enum ServerMode {
	Semantic = 0,
	// PartialSemantic = 1, // not support yet
	Syntactic = 2
}

export enum DiagnosticModel {
	None = 0,
	Push = 1,
	Pull = 2,
}

export interface LanguageServerInitializationOptions {
	typescript?: {
		// Absolute path to node_modules/typescript/lib
		tsdk: string;
	};
	l10n?: {
		location: string; // uri
	};
	serverMode?: ServerMode;
	diagnosticModel?: DiagnosticModel;
	textDocumentSync?: vscode.TextDocumentSyncKind | number;
	/**
	 * For better JSON parsing performance language server will filter CompletionList.
	 * 
	 * Enable this option if you want to get complete CompletionList in language client.
	 */
	fullCompletionList?: boolean;
	// for resolve https://github.com/sublimelsp/LSP-volar/issues/114
	ignoreTriggerCharacters?: string[];
	/**
	 * https://github.com/Microsoft/TypeScript/wiki/Standalone-Server-%28tsserver%29#cancellation
	 */
	cancellationPipeName?: string;
	noProjectReferences?: boolean;
	reverseConfigFilePriority?: boolean;
	disableFileWatcher?: boolean;
	/**
	 * Enable this option to make language server setup server capabilities based on client capabilities to support multiple servers.
	 */
	respectClientCapabilities?: boolean;
	maxFileSize?: number;
	configFilePath?: string;
	/**
	 * Extra semantic token types and modifiers that are supported by the client.
	 */
	semanticTokensLegend?: vscode.SemanticTokensLegend;
}
