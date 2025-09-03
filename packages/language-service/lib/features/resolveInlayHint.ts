import type * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import type { InlayHintData } from './provideInlayHints';

export function register(context: LanguageServiceContext) {
	return async (item: vscode.InlayHint, token = NoneCancellationToken) => {
		const data: InlayHintData | undefined = item.data;
		if (data) {
			const plugin = context.plugins[data.pluginIndex];
			if (!plugin[1].resolveInlayHint) {
				delete item.data;
				return item;
			}

			Object.assign(item, data.original);
			item = await plugin[1].resolveInlayHint(item, token);
		}

		delete item.data;
		return item;
	};
}
