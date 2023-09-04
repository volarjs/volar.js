import type { ServiceContext } from '../types.js';
import { documentFeatureWorker } from '../utils/featureWorkers.js';
import * as transformer from '../transformer/index.js';
import { NoneCancellationToken } from '../utils/cancellation.js';

import type * as _ from 'vscode-languageserver-protocol';

export function register(context: ServiceContext) {

	return (uri: string, token = NoneCancellationToken) => {

		return documentFeatureWorker(
			context,
			uri,
			file => !!file.capabilities.foldingRange,
			(service, document) => {

				if (token.isCancellationRequested)
					return;

				return service.provideFoldingRanges?.(document, token);
			},
			(data, map) => map ? transformer.asFoldingRanges(data, range => map.toSourceRange(range)) : data,
			arr => arr.flat(),
		);
	};
}
