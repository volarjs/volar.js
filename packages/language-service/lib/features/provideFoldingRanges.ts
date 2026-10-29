import { isFoldingRangesEnabled, SpanMapFeature } from '@volar/language-core';
import { type URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { documentFeatureWorker, getSourceRange } from '../utils/featureWorkers';
import { transformFoldingRanges } from '../utils/transform';

import type * as _ from 'vscode-languageserver-protocol';

export function register(context: LanguageServiceContext) {
	return (uri: URI, token = NoneCancellationToken) => {
		return documentFeatureWorker(
			context,
			uri,
			docs => docs[2].segments.some(segment => isFoldingRangesEnabled(segment.features)),
			(plugin, document) => {
				if (token.isCancellationRequested) {
					return;
				}
				return plugin[1].provideFoldingRanges?.(document, token);
			},
			(data, docs) => {
				if (!docs) {
					return data;
				}
				return transformFoldingRanges(
					data,
					range => getSourceRange(docs, range, SpanMapFeature.FoldingRanges),
				);
			},
			arr => arr.flat(),
		);
	};
}
