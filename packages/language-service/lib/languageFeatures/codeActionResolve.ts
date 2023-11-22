import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import type { ServiceCodeActionData } from './codeActions';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformWorkspaceEdit } from '../utils/transform';

export function register(context: ServiceContext) {

	return async (item: vscode.CodeAction, token = NoneCancellationToken) => {

		const data: ServiceCodeActionData | undefined = item.data;

		if (data) {

			const service = context.services[data.serviceIndex];
			if (!service.resolveCodeAction)
				return item;

			Object.assign(item, data.original);

			item = await service.resolveCodeAction(item, token);
			item = service.transformCodeAction?.(item)
				?? (
					item.edit
						? {
							...item,
							edit: transformWorkspaceEdit(
								item.edit,
								context,
								'codeAction',
								{ [data.uri]: data.version },
							),
						}
						: item
				);
		}

		return item;
	};
}
