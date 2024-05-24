import type { InitializeResult, LanguageService, ProviderResult } from '@volar/language-service';
import type { URI } from 'vscode-uri';
import type { createServerBase } from './server';

export interface Project {
	getLanguageService(server: LanguageServer, uri: URI): ProviderResult<LanguageService>;
	allLanguageServices(server: LanguageServer): ProviderResult<LanguageService[]>;
	reload(server: LanguageServer): void;
}

export type LanguageServer = ReturnType<typeof createServerBase>;

export interface VolarInitializeResult extends InitializeResult {
	autoInsertion?: {
		triggerCharacters: string[];
		configurationSections: (string | undefined)[];
	};
};
