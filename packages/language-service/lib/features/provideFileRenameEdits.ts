import type { URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import * as dedupe from '../utils/dedupe';
import { transformWorkspaceEdit } from '../utils/transform';

import type * as _ from 'vscode-languageserver-protocol';

export function register(context: LanguageServiceContext) {

	return async (oldUri: URI, newUri: URI, token = NoneCancellationToken) => {

		for (const service of context.services) {
			if (context.disabledServicePlugins.has(service[1])) {
				continue;
			}

			if (token.isCancellationRequested) {
				break;
			}

			if (!service[1].provideFileRenameEdits) {
				continue;
			}

			const workspaceEdit = await service[1].provideFileRenameEdits(oldUri, newUri, token);

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
