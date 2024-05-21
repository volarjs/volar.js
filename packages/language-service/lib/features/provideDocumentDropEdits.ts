import type * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServiceContext, DataTransferItem } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformWorkspaceEdit } from '../utils/transform';

export function register(context: LanguageServiceContext) {

	return (uri: string, position: vscode.Position, dataTransfer: Map<string, DataTransferItem>, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => position,
			function* (map) {
				for (const mappedPosition of map.getGeneratedPositions(position)) {
					yield mappedPosition;
				}
			},
			(service, document, arg) => {
				if (token.isCancellationRequested) {
					return;
				}
				return service[1].provideDocumentDropEdits?.(document, arg, dataTransfer, token);
			},
			edit => {
				if (edit.additionalEdit) {
					edit.additionalEdit = transformWorkspaceEdit(
						edit.additionalEdit,
						context,
						undefined,
					);
				}
				return edit;
			},
		);
	};
}
