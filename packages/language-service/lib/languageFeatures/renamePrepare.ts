import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { NoneCancellationToken } from '../utils/cancellation';
import { isRenameEnabled } from '@volar/language-core';

export function register(context: ServiceContext) {

	return (uri: string, position: vscode.Position, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => position,
			map => map.toGeneratedPositions(position, isRenameEnabled),
			(service, document, position) => {
				if (token.isCancellationRequested) {
					return;
				}
				return service[1].provideRenameRange?.(document, position, token);
			},
			(item, map) => {
				if (!map) {
					return item;
				}
				if ('start' in item && 'end' in item) {
					return map.toSourceRange(item);
				}
				return item;
			},
			prepares => {
				for (const prepare of prepares) {
					if ('start' in prepare && 'end' in prepare) {
						return prepare; // if has any valid range, ignore other errors
					}
				}
				return prepares[0] as vscode.ResponseError;
			},
		);
	};
}
