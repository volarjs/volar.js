import * as transformer from '../transformer';
import * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { ServiceCompletionData } from './complete';

export function register(context: ServiceContext) {

	return async (item: vscode.CompletionItem, token = vscode.CancellationToken.None) => {

		const data: ServiceCompletionData | undefined = item.data;

		if (data) {

			const service = context.services[data.serviceId];

			if (!service.resolveCompletionItem)
				return item;

			item = Object.assign(item, data.original);

			if (data.virtualDocumentUri) {

				for (const [_, map] of context.documents.getMapsByVirtualFileUri(data.virtualDocumentUri)) {

					item = await service.resolveCompletionItem(item, token);
					item = transformer.asCompletionItem(
						item,
						embeddedRange => {
							let range = service.resolveEmbeddedRange?.(embeddedRange);
							if (range) return range;
							return map.toSourceRange(embeddedRange);
						},
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
