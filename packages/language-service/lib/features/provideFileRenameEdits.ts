import type { LanguageServiceContext } from '../types';
import { transformWorkspaceEdit } from '../utils/transform';
import type * as _ from 'vscode-languageserver-protocol';
import * as dedupe from '../utils/dedupe';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: LanguageServiceContext) {

	return async (oldUri: string, newUri: string, token = NoneCancellationToken) => {

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
