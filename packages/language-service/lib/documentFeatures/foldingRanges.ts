import type { ServiceContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import * as transformer from '../transformer';
import { NoneCancellationToken } from '../utils/cancellation';

import type * as _ from 'vscode-languageserver-protocol';

export function register(context: ServiceContext) {

	return (uri: string, token = NoneCancellationToken) => {

		return documentFeatureWorker(
			context,
			uri,
			map => map.map.mappings.some(mapping => mapping.data.foldingRanges ?? true),
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
				return transformer.asFoldingRanges(
					data,
					range => map.toSourceRange(range, data => data.foldingRanges ?? true)
				);
			},
			arr => arr.flat(),
		);
	};
}
