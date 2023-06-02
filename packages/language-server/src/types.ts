import { FileSystem, LanguageService, ServiceEnvironment, SharedModules } from '@volar/language-service';
import type { TypeScriptLanguageHost } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver';
import { Config } from '@volar/language-service';
import { ProjectContext } from './common/project';

export interface RuntimeEnvironment {
	uriToFileName(uri: string): string;
	fileNameToUri(fileName: string): string;
	loadTypescript(tsdk: string): typeof import('typescript/lib/tsserverlibrary');
	loadTypescriptLocalized(tsdk: string, locale: string): Promise<{} | undefined>;
	onDidChangeConfiguration?(settings: any): void;
	fs: FileSystem;
	// https://github.com/microsoft/vscode/blob/7927075f89db213bc6e2182fa684d514d69e2359/extensions/html-language-features/server/src/htmlServer.ts#L53-L56
	readonly timer: {
		setImmediate(callback: (...args: any[]) => void, ...args: any[]): vscode.Disposable;
		// Seems not useful
		// setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): vscode.Disposable;
	};
}

export interface LanguageServerPlugin {
	(initOptions: InitializationOptions, modules: SharedModules): {
		extraFileExtensions?: ts.FileExtensionInfo[];
		watchFileExtensions?: string[];
		resolveConfig?(
			config: Config,
			ctx: {
				env: ServiceEnvironment;
				host: TypeScriptLanguageHost;
			} & ProjectContext | undefined,
		): Config | Promise<Config>;
		resolveExistingOptions?(options: ts.CompilerOptions | undefined): ts.CompilerOptions | undefined;
		onInitialized?(getLanguageService: (uri: string) => Promise<LanguageService | undefined>, env: RuntimeEnvironment): void;
	};
}

export enum ServerMode {
	Semantic = 0,
	PartialSemantic = 1,
	Syntactic = 2,
}

export enum DiagnosticModel {
	None = 0,
	Push = 1,
	Pull = 2,
}

export interface InitializationOptions {
	typescript?: {
		/**
		 * Absolute path to node_modules/typescript/lib
		 */
		tsdk: string;
	};
	l10n?: {
		location: string; // uri
	};
	serverMode?: ServerMode;
	diagnosticModel?: DiagnosticModel;
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
	reverseConfigFilePriority?: boolean;
	configFilePath?: string;
	/**
	 * Extra semantic token types and modifiers that are supported by the client.
	 */
	semanticTokensLegend?: vscode.SemanticTokensLegend;
	codegenStack?: boolean;
}
