import * as transformer from '../transformer';
import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServicePluginContext } from '../types';
import * as shared from '@volar/shared';

export function register(context: LanguageServicePluginContext) {

	return async (query: string) => {

		const symbolsList: vscode.WorkspaceSymbol[][] = [];

		for (const plugin of Object.values(context.plugins)) {

			if (!plugin.findWorkspaceSymbols)
				continue;

			const embeddedSymbols = await plugin.findWorkspaceSymbols(query);
			if (!embeddedSymbols)
				continue;

			const symbols = embeddedSymbols.map(symbol => transformer.asWorkspaceSymbol(symbol, loc => {
				if (context.documents.hasVirtualFileByUri(loc.uri)) {
					for (const [_, map] of context.documents.getMapsByVirtualFileUri(loc.uri)) {
						const range = map.toSourceRange(loc.range);
						if (range) {
							return vscode.Location.create(map.sourceFileDocument.uri, range);
						}
					}
				}
				else {
					return loc;
				}
			})).filter(shared.notEmpty);

			symbolsList.push(symbols);
		}

		return symbolsList.flat();
	};
}
