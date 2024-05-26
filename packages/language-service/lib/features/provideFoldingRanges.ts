import { isFoldingRangesEnabled } from '@volar/language-core';
import type { URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { documentFeatureWorker } from '../utils/featureWorkers';
import { transformFoldingRanges } from '../utils/transform';

import type * as _ from 'vscode-languageserver-protocol';

export function register(context: LanguageServiceContext) {

	return (uri: URI, token = NoneCancellationToken) => {

		return documentFeatureWorker(
			context,
			uri,
			map => map.map.mappings.some(mapping => isFoldingRangesEnabled(mapping.data)),
			(plugin, document) => {
				if (token.isCancellationRequested) {
					return;
				}
				return plugin[1].provideFoldingRanges?.(document, token);
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
