import * as transformer from '../transformer';
import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { ServiceCompletionData } from './complete';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: ServiceContext) {

	return async (item: vscode.CompletionItem, token = NoneCancellationToken) => {

		const data: ServiceCompletionData | undefined = item.data;

		if (data) {

			const service = context.services[data.serviceIndex];

			if (!service.resolveCompletionItem)
				return item;

			item = Object.assign(item, data.original);

			if (data.virtualDocumentUri) {

				for (const [_, map] of context.documents.getMapsByVirtualFileUri(data.virtualDocumentUri)) {

					item = await service.resolveCompletionItem(item, token);
					item = service.transformCompletionItem?.(item) ?? transformer.asCompletionItem(
						item,
						embeddedRange => map.toSourceRange(embeddedRange),
						map.virtualFileDocument,
					);
				}
			}
			else {
				item = await service.resolveCompletionItem(item, token);
			}
		}

		// TODO: monkey fix import ts file icon
		if (item.detail !== item.detail + '.ts') {
			item.detail = item.detail;
		}

		return item;
	};
}
