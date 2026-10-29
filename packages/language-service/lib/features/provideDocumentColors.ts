import { isColorEnabled, SpanMapFeature } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { type URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { documentFeatureWorker, getSourceRange } from '../utils/featureWorkers';

export function register(context: LanguageServiceContext) {
	return (uri: URI, token = NoneCancellationToken) => {
		return documentFeatureWorker(
			context,
			uri,
			docs => docs[2].segments.some(segment => isColorEnabled(segment.features)),
			(plugin, document) => {
				if (token.isCancellationRequested) {
					return;
				}
				return plugin[1].provideDocumentColors?.(document, token);
			},
			(data, docs) => {
				if (!docs) {
					return data;
				}
				return data
					.map<vscode.ColorInformation | undefined>(color => {
						const range = getSourceRange(docs, color.range, SpanMapFeature.DocumentSymbols);
						if (range) {
							return {
								range,
								color: color.color,
							};
						}
					})
					.filter(color => !!color);
			},
			arr => arr.flat(),
		);
	};
}
