import type * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServiceContext } from '../types';
import type { ServiceCompletionData } from './provideCompletionItems';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformCompletionItem } from '../utils/transform';
import { URI } from 'vscode-uri';

export function register(context: LanguageServiceContext) {

	return async (item: vscode.CompletionItem, token = NoneCancellationToken) => {

		const data: ServiceCompletionData | undefined = item.data;

		if (data) {

			const plugin = context.plugins[data.pluginIndex];

			if (!plugin[1].resolveCompletionItem) {
				return item;
			}

			item = Object.assign(item, data.original);

			if (data.embeddedDocumentUri) {

				const decoded = context.decodeEmbeddedDocumentUri(URI.parse(data.embeddedDocumentUri));
				const sourceScript = decoded && context.language.scripts.get(decoded[0]);
				const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

				if (virtualCode) {

					for (const map of context.documents.getMaps(virtualCode)) {

						item = await plugin[1].resolveCompletionItem(item, token);
						item = plugin[1].transformCompletionItem?.(item) ?? transformCompletionItem(
							item,
							embeddedRange => map.getSourceRange(embeddedRange),
							map.embeddedDocument,
							context
						);
					}
				}
			}
			else {
				item = await plugin[1].resolveCompletionItem(item, token);
			}
		}

		// TODO: monkey fix import ts file icon
		if (item.detail !== item.detail + '.ts') {
			item.detail = item.detail;
		}

		return item;
	};
}
