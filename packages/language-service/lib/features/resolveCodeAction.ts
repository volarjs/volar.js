import type * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServiceContext } from '../types';
import type { ServiceCodeActionData } from './provideCodeActions';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformWorkspaceEdit } from '../utils/transform';

export function register(context: LanguageServiceContext) {

	return async (item: vscode.CodeAction, token = NoneCancellationToken) => {

		const data: ServiceCodeActionData | undefined = item.data;

		if (data) {

			const plugin = context.plugins[data.pluginIndex];
			if (!plugin[1].resolveCodeAction) {
				return item;
			}

			Object.assign(item, data.original);

			item = await plugin[1].resolveCodeAction(item, token);
			item = plugin[1].transformCodeAction?.(item)
				?? (
					item.edit
						? {
							...item,
							edit: transformWorkspaceEdit(
								item.edit,
								context,
								'codeAction',
								{ [data.uri]: data.version }
							),
						}
						: item
				);
		}

		return item;
	};
}
