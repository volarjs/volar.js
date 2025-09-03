import { isMonikerEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { type URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { getGeneratedPositions, languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServiceContext) {
	return (uri: URI, position: vscode.Position, token = NoneCancellationToken) => {
		return languageFeatureWorker(
			context,
			uri,
			() => position,
			docs => getGeneratedPositions(docs, position, isMonikerEnabled),
			(plugin, document, position) => {
				if (token.isCancellationRequested) {
					return;
				}
				return plugin[1].provideMoniker?.(document, position, token);
			},
			result => result,
			results => results.flat(),
		);
	};
}
