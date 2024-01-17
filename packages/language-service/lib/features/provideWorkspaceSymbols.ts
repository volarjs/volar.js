import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { notEmpty } from '../utils/common';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformWorkspaceSymbol } from '../utils/transform';

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

				const [virtualCode] = context.documents.getVirtualCodeByUri(loc.uri);

				if (virtualCode) {
					for (const map of context.documents.getMaps(virtualCode)) {
						const range = map.getSourceRange(loc.range);
						if (range) {
							return { uri: map.sourceFileDocument.uri, range };
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
