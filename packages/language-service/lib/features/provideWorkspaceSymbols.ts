import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { notEmpty } from '../utils/common';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformWorkspaceSymbol } from '../utils/transform';
import { URI } from 'vscode-uri';

export function register(context: ServiceContext) {

	return async (query: string, token = NoneCancellationToken) => {

		const symbolsList: vscode.WorkspaceSymbol[][] = [];

		for (const service of context.services) {
			if (context.disabledServicePlugins.has(service[1])) {
				continue;
			}
			if (token.isCancellationRequested) {
				break;
			}
			if (!service[1].provideWorkspaceSymbols) {
				continue;
			}
			const embeddedSymbols = await service[1].provideWorkspaceSymbols(query, token);
			if (!embeddedSymbols) {
				continue;
			}
			const symbols = embeddedSymbols.map(symbol => transformWorkspaceSymbol(symbol, loc => {

				const decoded = context.decodeEmbeddedDocumentUri(URI.parse(loc.uri));
				const sourceScript = decoded && context.language.scripts.get(decoded[0]);
				const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

				if (virtualCode) {
					for (const map of context.documents.getMaps(virtualCode)) {
						const range = map.getSourceRange(loc.range);
						if (range) {
							return { uri: map.sourceDocument.uri, range };
						}
					}
				}
				else {
					return loc;
				}
			})).filter(notEmpty);

			symbolsList.push(symbols);
		}

		return symbolsList.flat();
	};
}
