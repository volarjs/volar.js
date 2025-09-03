import type * as vscode from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { type DocumentsAndMap, getSourceRange } from '../utils/featureWorkers';
import { transformCompletionItem } from '../utils/transform';
import type { ServiceCompletionData } from './provideCompletionItems';

export function register(context: LanguageServiceContext) {
	return async (item: vscode.CompletionItem, token = NoneCancellationToken) => {
		const data: ServiceCompletionData | undefined = item.data;
		if (data) {
			const plugin = context.plugins[data.pluginIndex];

			if (!plugin[1].resolveCompletionItem) {
				delete item.data;
				return item;
			}

			item = Object.assign(item, data.original);

			if (data.embeddedDocumentUri) {
				const decoded = context.decodeEmbeddedDocumentUri(URI.parse(data.embeddedDocumentUri));
				const sourceScript = decoded && context.language.scripts.get(decoded[0]);
				const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

				if (sourceScript && virtualCode) {
					const embeddedDocument = context.documents.get(
						context.encodeEmbeddedDocumentUri(sourceScript.id, virtualCode.id),
						virtualCode.languageId,
						virtualCode.snapshot,
					);
					for (const [sourceScript, map] of context.language.maps.forEach(virtualCode)) {
						const sourceDocument = context.documents.get(
							sourceScript.id,
							sourceScript.languageId,
							sourceScript.snapshot,
						);
						const docs: DocumentsAndMap = [sourceDocument, embeddedDocument, map];

						item = await plugin[1].resolveCompletionItem(item, token);
						item = plugin[1].transformCompletionItem?.(item) ?? transformCompletionItem(
							item,
							embeddedRange => getSourceRange(docs, embeddedRange),
							embeddedDocument,
							context,
						);
					}
				}
			}
			else {
				item = await plugin[1].resolveCompletionItem(item, token);
			}
		}

		delete item.data;
		return item;
	};
}
