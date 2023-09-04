import type { ServiceContext } from '../types.js';
import { languageFeatureWorker } from '../utils/featureWorkers.js';
import type * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common.js';
import { NoneCancellationToken } from '../utils/cancellation.js';

export function register(context: ServiceContext) {

	return (uri: string, position: vscode.Position, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			position,
			(position, map) => map.toGeneratedPositions(position, data => !!data.completion),
			(service, document, position) => {

				if (token.isCancellationRequested)
					return;

				return service.provideLinkedEditingRanges?.(document, position, token);
			},
			(data, map) => map ? ({
				wordPattern: data.wordPattern,
				ranges: data.ranges.map(range => map.toSourceRange(range)).filter(notEmpty),
			}) : data,
		);
	};
}
