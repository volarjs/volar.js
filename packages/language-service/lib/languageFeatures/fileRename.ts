import type { ServiceContext } from '../types';
import { transformWorkspaceEdit } from '../utils/transform';
import type * as _ from 'vscode-languageserver-protocol';
import * as dedupe from '../utils/dedupe';
import { forEachEmbeddedFile } from '@volar/language-core';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: ServiceContext) {

	return async (oldUri: string, newUri: string, token = NoneCancellationToken) => {

		const sourceFile = context.project.fileProvider.getSourceFile(oldUri);

		if (sourceFile?.root) {

			let tsExt: string | undefined;

			for (const virtualFile of forEachEmbeddedFile(sourceFile.root)) {
				if (virtualFile.typescript?.isLanguageServiceSourceFile && virtualFile.id.replace(sourceFile.id, '').match(/^\.(js|ts)x?$/)) {
					tsExt = virtualFile.id.substring(virtualFile.id.lastIndexOf('.'));
				}
			}

			if (!tsExt) {
				return;
			}

			oldUri += tsExt;
			newUri += tsExt;
		}

		for (const service of context.services) {

			if (token.isCancellationRequested)
				break;

			if (!service.provideFileRenameEdits)
				continue;

			const workspaceEdit = await service.provideFileRenameEdits(oldUri, newUri, token);

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
