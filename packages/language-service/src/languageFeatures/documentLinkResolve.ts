import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types.js';
import type { DocumentLinkData } from './documentLinks.js';
import { NoneCancellationToken } from '../utils/cancellation.js';

export function register(context: ServiceContext) {

	return async (item: vscode.CodeLens, token = NoneCancellationToken) => {

		const data: DocumentLinkData | undefined = item.data;
		if (data) {
			const service = context.services[data.serviceId];
			if (!service.resolveDocumentLink)
				return item;

			Object.assign(item, data.original);
			item = await service.resolveDocumentLink(item, token);
		}

		return item;
	};
}
