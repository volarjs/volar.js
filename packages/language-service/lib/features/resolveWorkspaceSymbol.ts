import type * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServiceContext } from '../types';
import type { WorkspaceSymbolData } from './provideWorkspaceSymbols';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: LanguageServiceContext) {

	return async (symbol: vscode.WorkspaceSymbol, token = NoneCancellationToken) => {

		const data: WorkspaceSymbolData | undefined = symbol.data;
		if (data) {
			const plugin = context.plugins[data.pluginIndex];
			if (!plugin[1].resolveWorkspaceSymbol) {
				return symbol;
			}

			Object.assign(symbol, data.original);
			symbol = await plugin[1].resolveWorkspaceSymbol(symbol, token);
		}

		return symbol;
	};
}
