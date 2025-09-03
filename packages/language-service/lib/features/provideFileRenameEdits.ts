import { type URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import * as dedupe from '../utils/dedupe';
import { transformWorkspaceEdit } from '../utils/transform';

import type * as _ from 'vscode-languageserver-protocol';

export function register(context: LanguageServiceContext) {
	return async (oldUri: URI, newUri: URI, token = NoneCancellationToken) => {
		for (const plugin of context.plugins) {
			if (context.disabledServicePlugins.has(plugin[1])) {
				continue;
			}

			if (token.isCancellationRequested) {
				break;
			}

			if (!plugin[1].provideFileRenameEdits) {
				continue;
			}

			const workspaceEdit = await plugin[1].provideFileRenameEdits(oldUri, newUri, token);

			if (workspaceEdit) {
				const result = transformWorkspaceEdit(
					workspaceEdit,
					context,
					'fileName',
				);

				if (result?.documentChanges) {
					result.documentChanges = dedupe.withDocumentChanges(result.documentChanges);
				}

				return result;
			}
		}
	};
}
