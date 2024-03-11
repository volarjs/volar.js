import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import type { ServiceCompletionData } from './provideCompletionItems';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformCompletionItem } from '../utils/transform';

export function register(context: ServiceContext) {

	return async (item: vscode.CompletionItem, token = NoneCancellationToken) => {

		const data: ServiceCompletionData | undefined = item.data;

		if (data) {

			const service = context.services[data.serviceIndex];

			if (!service[1].resolveCompletionItem) {
				return item;
			}

			item = Object.assign(item, data.original);

			if (data.embeddedContentUri) {

				const decoded = context.documents.decodeEmbeddedContentUri(data.embeddedContentUri);
				const virtualCode = decoded
					? context.language.files.getVirtualCode(decoded.documentUri, decoded.embeddedCodeId)[0]
					: undefined;

				if (virtualCode) {

					for (const map of context.documents.getMaps(virtualCode)) {

						item = await service[1].resolveCompletionItem(item, token);
						item = service[1].transformCompletionItem?.(item) ?? transformCompletionItem(
							item,
							embeddedRange => map.getSourceRange(embeddedRange),
							map.embeddedDocument,
							context,
						);
					}
				}
			}
			else {
				item = await service[1].resolveCompletionItem(item, token);
			}
		}

		// TODO: monkey fix import ts file icon
		if (item.detail !== item.detail + '.ts') {
			item.detail = item.detail;
		}

		return item;
	};
}
