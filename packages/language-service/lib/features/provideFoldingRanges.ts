import type { LanguageServiceContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import { NoneCancellationToken } from '../utils/cancellation';

import type * as _ from 'vscode-languageserver-protocol';
import { transformFoldingRanges } from '../utils/transform';
import { isFoldingRangesEnabled } from '@volar/language-core';

export function register(context: LanguageServiceContext) {

	return (uri: string, token = NoneCancellationToken) => {

		return documentFeatureWorker(
			context,
			uri,
			map => map.map.mappings.some(mapping => isFoldingRangesEnabled(mapping.data)),
			(service, document) => {
				if (token.isCancellationRequested) {
					return;
				}
				return service[1].provideFoldingRanges?.(document, token);
			},
			(data, map) => {
				if (!map) {
					return data;
				}
				return transformFoldingRanges(
					data,
					range => map.getSourceRange(range, isFoldingRangesEnabled)
				);
			},
			arr => arr.flat(),
		);
	};
}
