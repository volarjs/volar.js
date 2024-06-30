import type * as vscode from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import type { DataTransferItem, LanguageServiceContext, UriComponents } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { getGeneratedPositions, languageFeatureWorker } from '../utils/featureWorkers';
import { transformWorkspaceEdit } from '../utils/transform';

export function register(context: LanguageServiceContext) {

	return (_uri: URI | UriComponents, position: vscode.Position, dataTransfer: Map<string, DataTransferItem>, token = NoneCancellationToken) => {
		const uri = _uri instanceof URI ? _uri : URI.from(_uri);

		return languageFeatureWorker(
			context,
			uri,
			() => position,
			function* (docs) {
				for (const mappedPosition of getGeneratedPositions(docs, position)) {
					yield mappedPosition;
				}
			},
			(plugin, document, arg) => {
				if (token.isCancellationRequested) {
					return;
				}
				return plugin[1].provideDocumentDropEdits?.(document, arg, dataTransfer, token);
			},
			edit => {
				if (edit.additionalEdit) {
					edit.additionalEdit = transformWorkspaceEdit(
						edit.additionalEdit,
						context,
						undefined
					);
				}
				return edit;
			}
		);
	};
}
