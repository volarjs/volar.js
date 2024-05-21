import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import type { InlayHintData } from './provideInlayHints';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: ServiceContext) {

	return async (item: vscode.InlayHint, token = NoneCancellationToken) => {

		const data: InlayHintData | undefined = item.data;
		if (data) {
			const service = context.services[data.serviceIndex];
			if (!service[1].resolveInlayHint) {
				return item;
			}

			Object.assign(item, data.original);
			item = await service[1].resolveInlayHint(item, token);
		}

		return item;
	};
}
