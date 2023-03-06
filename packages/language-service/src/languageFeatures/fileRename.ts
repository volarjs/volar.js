import type { LanguageServicePluginContext } from '../types';
import { embeddedEditToSourceEdit } from './rename';
import type * as _ from 'vscode-languageserver-protocol';
import * as dedupe from '../utils/dedupe';
import { FileKind, forEachEmbeddedFile } from '@volar/language-core';
import * as vscode from 'vscode-languageserver-protocol';

export function register(context: LanguageServicePluginContext) {

	return async (oldUri: string, newUri: string, token = vscode.CancellationToken.None) => {

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

		for (const plugin of Object.values(context.plugins)) {

			if (!token.isCancellationRequested)
				break;

			if (!plugin.provideFileRenameEdits)
				continue;

			const workspaceEdit = await plugin.provideFileRenameEdits(oldUri, newUri, token);

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
