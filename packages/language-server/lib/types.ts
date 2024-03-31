import type { FileSystem, LanguageService, LanguageServicePlugin, TypeScriptProjectHost } from '@volar/language-service';
import type * as vscode from 'vscode-languageserver';
import type { ServerContext, ServerOptions } from './server';
import type { createSys } from '@volar/typescript';

export interface ServerRuntimeEnvironment {
	fs: FileSystem;
}

export interface ProjectContext {
	typescript?: {
		configFileName: string | undefined;
		host: TypeScriptProjectHost;
		sys: ReturnType<typeof createSys>;
	};
}

export enum DiagnosticModel {
	None = 0,
	Push = 1,
	Pull = 2,
}

export interface InitializationOptions {
	l10n?: {
		location: string; // uri
	};
	diagnosticModel?: DiagnosticModel;
	maxFileSize?: number;
	/**
	 * Extra semantic token types and modifiers that are supported by the client.
	 */
	semanticTokensLegend?: vscode.SemanticTokensLegend;
	codegenStack?: boolean;
}

export interface ServerProject {
	getLanguageService(): LanguageService;
	getLanguageServiceDontCreate(): LanguageService | undefined;
	dispose(): void;
}

export interface ServerProjectProvider {
	getProject(uri: string): Promise<ServerProject>;
	getProjects(): Promise<ServerProject[]>;
	reloadProjects(): Promise<void> | void;
}

export interface ServerProjectProviderFactory {
	(
		context: ServerContext,
		servicePlugins: LanguageServicePlugin[],
		getLanguagePlugins: ServerOptions['getLanguagePlugins'],
		getLanguageId: ServerOptions['getLanguageId'],
	): ServerProjectProvider;
}
