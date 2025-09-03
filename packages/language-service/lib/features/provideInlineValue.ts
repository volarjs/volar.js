import { isInlineValueEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { type URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { getGeneratedRanges, getSourceRange, languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServiceContext) {
	return (uri: URI, range: vscode.Range, ivContext: vscode.InlineValueContext, token = NoneCancellationToken) => {
		return languageFeatureWorker(
			context,
			uri,
			() => range,
			docs => getGeneratedRanges(docs, range, isInlineValueEnabled),
			(plugin, document, range) => {
				if (token.isCancellationRequested) {
					return;
				}
				return plugin[1].provideInlineValues?.(document, range, ivContext, token);
			},
			(items, docs) => {
				if (!docs) {
					return items;
				}
				return items
					.map(item => {
						const mappedRange = getSourceRange(docs, item.range, isInlineValueEnabled);
						if (mappedRange) {
							item.range = mappedRange;
							return item;
						}
					})
					.filter(item => !!item);
			},
			results => results.flat(),
		);
	};
}
