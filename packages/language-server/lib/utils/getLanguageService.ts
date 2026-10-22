import type { LanguageService } from '@volar/language-service';
import type { Connection } from 'vscode-languageserver';
import type { URI } from 'vscode-uri';
import type { LanguageServerProject } from '../types';

/**
 * A project that fails to provide a language service fails only the request or diagnostics pass
 * that asked for it; the error is logged instead of becoming an unhandled rejection.
 */
export async function getLanguageService(
	connection: Connection,
	project: LanguageServerProject,
	uri: URI,
): Promise<LanguageService | undefined> {
	try {
		return await project.getLanguageService(uri);
	}
	catch (error) {
		connection.console.error(
			`Failed to get the language service for ${uri.toString()}: ${
				error instanceof Error ? error.stack ?? error.message : String(error)
			}`,
		);
	}
}
