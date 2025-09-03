import type * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import type { WorkspaceSymbolData } from './provideWorkspaceSymbols';

export function register(context: LanguageServiceContext) {
	return async (item: vscode.WorkspaceSymbol, token = NoneCancellationToken) => {
		const data: WorkspaceSymbolData | undefined = item.data;
		if (data) {
			const plugin = context.plugins[data.pluginIndex];
			if (!plugin[1].resolveWorkspaceSymbol) {
				delete item.data;
				return item;
			}

			Object.assign(item, data.original);
			item = await plugin[1].resolveWorkspaceSymbol(item, token);
		}

		delete item.data;
		return item;
	};
}
