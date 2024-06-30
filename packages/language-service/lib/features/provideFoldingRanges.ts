import { isFoldingRangesEnabled } from '@volar/language-core';
import { URI } from 'vscode-uri';
import type { LanguageServiceContext, UriComponents } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { documentFeatureWorker, getSourceRange } from '../utils/featureWorkers';
import { transformFoldingRanges } from '../utils/transform';

import type * as _ from 'vscode-languageserver-protocol';

export function register(context: LanguageServiceContext) {

	return (_uri: URI | UriComponents, token = NoneCancellationToken) => {
		const uri = _uri instanceof URI ? _uri : URI.from(_uri);

		return documentFeatureWorker(
			context,
			uri,
			docs => docs[2].mappings.some(mapping => isFoldingRangesEnabled(mapping.data)),
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
					range => getSourceRange(docs, range, isFoldingRangesEnabled)
				);
			},
			arr => arr.flat()
		);
	};
}
