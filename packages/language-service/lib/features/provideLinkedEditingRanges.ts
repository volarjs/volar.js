import { isLinkedEditingEnabled } from '@volar/language-core';
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
			function*(docs) {
				for (const pos of getGeneratedPositions(docs, position, isLinkedEditingEnabled)) {
					yield pos;
				}
			},
			(plugin, document, position) => {
				if (token.isCancellationRequested) {
					return;
				}

				return plugin[1].provideLinkedEditingRanges?.(document, position, token);
			},
			(ranges, docs) => {
				if (!docs) {
					return ranges;
				}
				return {
					wordPattern: ranges.wordPattern,
					ranges: ranges.ranges
						.map(range => getSourceRange(docs, range, isLinkedEditingEnabled))
						.filter(range => !!range),
				};
			},
		);
	};
}
