import type { ServiceContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import { NoneCancellationToken } from '../utils/cancellation';

import type * as _ from 'vscode-languageserver-protocol';
import { transformFoldingRanges } from '../utils/transform';

export function register(context: ServiceContext) {

	return (uri: string, token = NoneCancellationToken) => {

		return documentFeatureWorker(
			context,
			uri,
			map => map.map.codeMappings.some(mapping => mapping.data.foldingRanges ?? true),
			(service, document) => {
				if (token.isCancellationRequested) {
					return;
				}
				return service.provideFoldingRanges?.(document, token);
			},
			(data, map) => {
				if (!map) {
					return data;
				}
				return transformFoldingRanges(
					data,
					range => map.toSourceRange(range, data => data.foldingRanges ?? true)
				);
			},
			arr => arr.flat(),
		);
	};
}
