import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { DocumentLinkData } from './documentLinks';
import { NoneCancellationToken } from '../utils/cancellation';

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
