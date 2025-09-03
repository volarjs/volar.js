import type * as vscode from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { type DocumentsAndMap, getSourceRange } from '../utils/featureWorkers';
import { transformWorkspaceSymbol } from '../utils/transform';

export interface WorkspaceSymbolData {
	original: Pick<vscode.WorkspaceSymbol, 'data'>;
	pluginIndex: number;
}

export function register(context: LanguageServiceContext) {
	return async (query: string, token = NoneCancellationToken) => {
		const symbolsList: vscode.WorkspaceSymbol[][] = [];

		for (const plugin of context.plugins) {
			if (context.disabledServicePlugins.has(plugin[1])) {
				continue;
			}
			if (token.isCancellationRequested) {
				break;
			}
			if (!plugin[1].provideWorkspaceSymbols) {
				continue;
			}
			const embeddedSymbols = await plugin[1].provideWorkspaceSymbols(query, token);
			if (!embeddedSymbols) {
				continue;
			}
			const symbols = embeddedSymbols
				.map(symbol =>
					transformWorkspaceSymbol(symbol, loc => {
						const decoded = context.decodeEmbeddedDocumentUri(URI.parse(loc.uri));
						const sourceScript = decoded && context.language.scripts.get(decoded[0]);
						const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

						if (sourceScript && virtualCode) {
							const embeddedDocument = context.documents.get(
								context.encodeEmbeddedDocumentUri(sourceScript.id, virtualCode.id),
								virtualCode.languageId,
								virtualCode.snapshot,
							);
							for (const [sourceScript, map] of context.language.maps.forEach(virtualCode)) {
								const sourceDocument = context.documents.get(
									sourceScript.id,
									sourceScript.languageId,
									sourceScript.snapshot,
								);
								const docs: DocumentsAndMap = [sourceDocument, embeddedDocument, map];
								const range = getSourceRange(docs, loc.range);
								if (range) {
									return { uri: sourceDocument.uri, range };
								}
							}
						}
						else {
							return loc;
						}
					})
				)
				.filter(symbol => !!symbol);

			symbols?.forEach(symbol => {
				if (plugin[1].resolveWorkspaceSymbol) {
					symbol.data = {
						original: {
							data: symbol.data,
						},
						pluginIndex: context.plugins.indexOf(plugin),
					} satisfies WorkspaceSymbolData;
				}
				else {
					delete symbol.data;
				}
			});

			symbolsList.push(symbols);
		}

		return symbolsList.flat();
	};
}
