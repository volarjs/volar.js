import * as transformer from '../transformer';
import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServicePluginContext } from '../types';
import { PluginCompletionData } from './complete';

export function register(context: LanguageServicePluginContext) {

	return async (item: vscode.CompletionItem, token = vscode.CancellationToken.None) => {

		const data: PluginCompletionData | undefined = item.data;

		if (data) {

			const plugin = context.plugins[data.pluginId];

			if (!plugin.resolveCompletionItem)
				return item;

			item = Object.assign(item, data.original);

			if (data.virtualDocumentUri) {

				for (const [_, map] of context.documents.getMapsByVirtualFileUri(data.virtualDocumentUri)) {

					item = await plugin.resolveCompletionItem(item, token);
					item = transformer.asCompletionItem(
						item,
						embeddedRange => {
							let range = plugin.resolveEmbeddedRange?.(embeddedRange);
							if (range) return range;
							return map.toSourceRange(embeddedRange);
						},
						map.virtualFileDocument,
					);
				}
			}
			else {
				item = await plugin.resolveCompletionItem(item, token);
			}
		}

		// TODO: monkey fix import ts file icon
		if (item.detail !== item.detail + '.ts') {
			item.detail = item.detail;
		}

		return item;
	};
}
