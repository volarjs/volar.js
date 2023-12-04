import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { notEmpty } from '../utils/common';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformWorkspaceSymbol } from '../utils/transform';

export function register(context: ServiceContext) {

	return async (query: string, token = NoneCancellationToken) => {

		const symbolsList: vscode.WorkspaceSymbol[][] = [];

		for (const service of context.services) {
			if (token.isCancellationRequested) {
				break;
			}
			if (!service.provideWorkspaceSymbols) {
				continue;
			}
			const embeddedSymbols = await service.provideWorkspaceSymbols(query, token);
			if (!embeddedSymbols) {
				continue;
			}
			const symbols = embeddedSymbols.map(symbol => transformWorkspaceSymbol(symbol, loc => {

				const [virtualFile] = context.language.files.getVirtualFile(loc.uri);

				if (virtualFile) {
					for (const map of context.documents.getMaps(virtualFile)) {
						const range = map.toSourceRange(loc.range);
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
