import { isLinkedEditingEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { notEmpty } from '../utils/common';
import { languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServiceContext) {

	return (uri: URI, position: vscode.Position, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => position,
			function* (map) {
				for (const pos of map.getGeneratedPositions(position, isLinkedEditingEnabled)) {
					yield pos;
				}
			},
			(plugin, document, position) => {

				if (token.isCancellationRequested) {
					return;
				}

				return plugin[1].provideLinkedEditingRanges?.(document, position, token);
			},
			(ranges, map) => {
				if (!map) {
					return ranges;
				}
				return {
					wordPattern: ranges.wordPattern,
					ranges: ranges.ranges
						.map(range => map.getSourceRange(range, isLinkedEditingEnabled))
						.filter(notEmpty),
				};
			}
		);
	};
}
