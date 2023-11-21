import type { ServiceContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import type * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: ServiceContext) {

	return (uri: string, position: vscode.Position, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => position,
			function* (map) {
				for (const pos of map.toGeneratedPositions(
					position,
					data => data.linkedEditingRanges ?? true
				)) {
					yield pos;
				}
			},
			(service, document, position) => {

				if (token.isCancellationRequested)
					return;

				return service.provideLinkedEditingRanges?.(document, position, token);
			},
			(ranges, map) => {
				if (!map) {
					return ranges;
				}
				return {
					wordPattern: ranges.wordPattern,
					ranges: ranges.ranges.map(range => map.toSourceRange(
						range,
						data => data.linkedEditingRanges ?? true
					)).filter(notEmpty),
				};
			},
		);
	};
}
