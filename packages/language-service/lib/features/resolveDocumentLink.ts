import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformDocumentLinkTarget } from '../utils/transform';
import type { DocumentLinkData } from './provideDocumentLinks';

export function register(context: ServiceContext) {

	return async (item: vscode.DocumentLink, token = NoneCancellationToken) => {

		const data: DocumentLinkData | undefined = item.data;
		if (data) {
			const service = context.services[data.serviceIndex];
			if (!service[1].resolveDocumentLink) {
				return item;
			}

			Object.assign(item, data.original);
			item = await service[1].resolveDocumentLink(item, token);

			if (item.target) {
				item.target = transformDocumentLinkTarget(item.target, context);
			}
		}

		return item;
	};
}
