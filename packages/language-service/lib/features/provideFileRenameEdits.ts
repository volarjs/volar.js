import type { ServiceContext } from '../types';
import { transformWorkspaceEdit } from '../utils/transform';
import type * as _ from 'vscode-languageserver-protocol';
import * as dedupe from '../utils/dedupe';
import { forEachEmbeddedFile } from '@volar/language-core';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: ServiceContext) {

	return async (oldUri: string, newUri: string, token = NoneCancellationToken) => {

		const sourceFile = context.language.files.getSourceFile(context.env.uriToFileName(oldUri));

		if (sourceFile?.virtualFile) {

			let tsExt: string | undefined;

			for (const virtualFile of forEachEmbeddedFile(sourceFile.virtualFile[0])) {
				if (virtualFile.typescript && virtualFile.fileName.substring(sourceFile.fileName.length).match(/^\.(js|ts)x?$/)) {
					tsExt = virtualFile.fileName.substring(virtualFile.fileName.lastIndexOf('.'));
				}
			}

			if (!tsExt) {
				return;
			}

			oldUri += tsExt;
			newUri += tsExt;
		}

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
