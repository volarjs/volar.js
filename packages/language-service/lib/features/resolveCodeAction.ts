import type * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformWorkspaceEdit } from '../utils/transform';
import type { ServiceCodeActionData } from './provideCodeActions';

export function register(context: LanguageServiceContext) {
	return async (item: vscode.CodeAction, token = NoneCancellationToken) => {
		const data: ServiceCodeActionData | undefined = item.data;
		if (data) {
			const plugin = context.plugins[data.pluginIndex];
			if (!plugin[1].resolveCodeAction) {
				delete item.data;
				return item;
			}

			Object.assign(item, data.original);

			item = await plugin[1].resolveCodeAction(item, token);
			item = plugin[1].transformCodeAction?.(item)
				?? (
					item.edit
						? {
							...item,
							// No `versions`: `data.version` is the service's own document counter
							// (see `context.documents.get`), not the version the client sent. Reporting
							// it makes strict clients reject the edit as stale, so leave it `null`, as
							// `provideCodeActions` already does.
							edit: transformWorkspaceEdit(item.edit, context, 'codeAction'),
						}
						: item
				);
		}

		delete item.data;
		return item;
	};
}
