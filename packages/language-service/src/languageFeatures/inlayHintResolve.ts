import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types.js';
import type { InlayHintData } from './inlayHints.js';
import { NoneCancellationToken } from '../utils/cancellation.js';

export function register(context: ServiceContext) {

	return async (item: vscode.InlayHint, token = NoneCancellationToken) => {

		const data: InlayHintData | undefined = item.data;
		if (data) {
			const service = context.services[data.serviceId];
			if (!service.resolveInlayHint)
				return item;

			Object.assign(item, data.original);
			item = await service.resolveInlayHint(item, token);
		}

		return item;
	};
}
