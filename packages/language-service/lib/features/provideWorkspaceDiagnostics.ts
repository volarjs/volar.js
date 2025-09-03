import type * as vscode from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { type DocumentsAndMap } from '../utils/featureWorkers';
import { transformDiagnostic } from './provideDiagnostics';

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
							const map = context.language.maps.get(virtualCode, sourceScript);
							const docs: DocumentsAndMap = [
								context.documents.get(sourceScript.id, sourceScript.languageId, sourceScript.snapshot),
								context.documents.get(
									context.encodeEmbeddedDocumentUri(sourceScript.id, virtualCode.id),
									virtualCode.languageId,
									virtualCode.snapshot,
								),
								map,
							];
							return {
								...item,
								items: item.items
									.map(error => transformDiagnostic(context, error, docs))
									.filter(error => !!error),
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
								.map(error => transformDiagnostic(context, error, undefined))
								.filter(error => !!error),
						};
					}
				});

			allItems.push(...items);
		}

		return allItems;
	};
}
