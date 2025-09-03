import type * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformDocumentLinkTarget } from '../utils/transform';
import type { DocumentLinkData } from './provideDocumentLinks';

export function register(context: LanguageServiceContext) {
	return async (item: vscode.DocumentLink, token = NoneCancellationToken) => {
		const data: DocumentLinkData | undefined = item.data;
		if (data) {
			const plugin = context.plugins[data.pluginIndex];
			if (!plugin[1].resolveDocumentLink) {
				delete item.data;
				return item;
			}

			Object.assign(item, data.original);
			item = await plugin[1].resolveDocumentLink(item, token);

			if (item.target) {
				item.target = transformDocumentLinkTarget(item.target, context).toString();
			}
		}

		delete item.data;
		return item;
	};
}
