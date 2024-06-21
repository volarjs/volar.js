import type * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { URI } from 'vscode-uri';
import { transformDiagnostic } from './provideDiagnostics';
import { shouldReportDiagnostics } from '@volar/language-core';

export function register(context: LanguageServiceContext) {

	return async (token = NoneCancellationToken) => {

		const allItems: vscode.WorkspaceDocumentDiagnosticReport[] = [];

		for (const plugin of context.plugins) {
			if (context.disabledServicePlugins.has(plugin[1])) {
				continue;
			}
			if (token.isCancellationRequested) {
				break;
			}
			if (!plugin[1].provideWorkspaceDiagnostics) {
				continue;
			}
			const report = await plugin[1].provideWorkspaceDiagnostics(token);
			if (!report) {
				continue;
			}
			const items = report
				.map<vscode.WorkspaceDocumentDiagnosticReport>(item => {
					const decoded = context.decodeEmbeddedDocumentUri(URI.parse(item.uri));
					const sourceScript = decoded && context.language.scripts.get(decoded[0]);
					const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

					if (virtualCode && sourceScript) {
						if (item.kind === 'unchanged') {
							return {
								...item,
								uri: sourceScript.id.toString(),
							};
						}
						else {
							const map = context.documents.getMap(virtualCode, sourceScript);
							return {
								...item,
								items: item.items
									.map(error => transformDiagnostic(context, error, map, shouldReportDiagnostics))
									.filter(error => !!error)
							};
						}
					}
					else {
						if (item.kind === 'unchanged') {
							return item;
						}
						return {
							...item,
							items: item.items
								.map(error => transformDiagnostic(context, error, undefined, shouldReportDiagnostics))
								.filter(error => !!error)
						};
					}
				});

			allItems.push(...items);
		}

		return allItems;
	};
}
