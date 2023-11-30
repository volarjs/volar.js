import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext, DataTransferItem } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformWorkspaceEdit } from '../utils/transform';

export function register(context: ServiceContext) {

	return (uri: string, position: vscode.Position, dataTransfer: Map<string, DataTransferItem>, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => position,
			function* (map) {
				for (const mappedPosition of map.toGeneratedPositions(position)) {
					yield mappedPosition;
				}
			},
			(service, document, arg) => {
				if (token.isCancellationRequested) {
					return;
				}
				return service.provideDocumentDropEdits?.(document, arg, dataTransfer, token);
			},
			(edit) => {
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
