import { isRenameEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { type URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { getGeneratedPositions, getSourceRange, languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServiceContext) {
	return (uri: URI, position: vscode.Position, token = NoneCancellationToken) => {
		return languageFeatureWorker(
			context,
			uri,
			() => position,
			docs => getGeneratedPositions(docs, position, isRenameEnabled),
			(plugin, document, position) => {
				if (token.isCancellationRequested) {
					return;
				}
				return plugin[1].provideRenameRange?.(document, position, token);
			},
			(item, docs) => {
				if (!docs) {
					return item;
				}
				if ('start' in item && 'end' in item) {
					return getSourceRange(docs, item);
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
