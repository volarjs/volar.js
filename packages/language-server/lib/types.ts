import type { InitializeResult, LanguageService, ProviderResult } from '@volar/language-service';
import type { URI } from 'vscode-uri';
import type { createServerBase } from './server';

export interface LanguageServerProject {
	setup(server: LanguageServer): void;
	getLanguageService(uri: URI): ProviderResult<LanguageService>;
	getExistingLanguageServices(): ProviderResult<LanguageService[]>;
	reload(): void;
}

export type LanguageServer = ReturnType<typeof createServerBase>;

export interface VolarInitializeResult extends InitializeResult<{
	fileReferencesProvider?: boolean;
	fileRenameProvider?: boolean;
	autoInsertionProvider?: {
		triggerCharacters: string[];
		configurationSections?: (string[] | null)[];
	};
}> { }
