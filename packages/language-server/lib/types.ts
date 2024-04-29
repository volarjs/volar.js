import type { LanguageService } from '@volar/language-service';
import type * as vscode from 'vscode-languageserver';
import type { createServerBase } from './server';

export interface InitializationOptions {
	l10n?: {
		location: string; // uri
	};
	maxFileSize?: number;
	codegenStack?: boolean;
}

export type VolarInitializeParams = Omit<vscode.InitializeParams, 'initializationOptions'> & { initializationOptions?: InitializationOptions; };;

export interface ServerProject {
	getLanguageService(): LanguageService;
	getLanguageServiceDontCreate(): LanguageService | undefined;
	dispose(): void;
}

export interface ServerProjectProvider {
	get(this: ServerBase, uri: string): Promise<ServerProject>;
	all(this: ServerBase): Promise<ServerProject[]>;
}

export type ServerBase = ReturnType<typeof createServerBase>;
