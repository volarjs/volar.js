import type { ServiceContext } from '../types';
import { embeddedEditToSourceEdit } from './rename';
import type * as _ from 'vscode-languageserver-protocol';
import * as dedupe from '../utils/dedupe';
import { FileKind, forEachEmbeddedFile } from '@volar/language-core';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: ServiceContext) {

	return async (oldUri: string, newUri: string, token = NoneCancellationToken) => {

		const rootFile = context.documents.getSourceByUri(oldUri)?.root;

		if (rootFile) {

			let tsExt: string | undefined;

			forEachEmbeddedFile(rootFile, embedded => {
				if (embedded.kind === FileKind.TypeScriptHostFile && embedded.fileName.replace(rootFile.fileName, '').match(/^\.(js|ts)x?$/)) {
					tsExt = embedded.fileName.substring(embedded.fileName.lastIndexOf('.'));
				}
			});

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

				const result = embeddedEditToSourceEdit(
					workspaceEdit,
					context.documents,
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
