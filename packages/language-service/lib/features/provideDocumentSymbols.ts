import { isSymbolsEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { isInsideRange, notEmpty } from '../utils/common';
import { documentFeatureWorker } from '../utils/featureWorkers';
import { transformDocumentSymbol } from '../utils/transform';

export function register(context: LanguageServiceContext) {

	return (uri: URI, token = NoneCancellationToken): Promise<vscode.DocumentSymbol[] | undefined> => {

		return documentFeatureWorker(
			context,
			uri,
			map => map.map.mappings.some(mapping => isSymbolsEnabled(mapping.data)),
			async (plugin, document) => {
				if (token.isCancellationRequested) {
					return;
				}
				return plugin[1].provideDocumentSymbols?.(document, token);
			},
			(data, map) => {
				if (!map) {
					return data;
				}
				return data
					.map(symbol => transformDocumentSymbol(
						symbol,
						range => map.getSourceRange(range, isSymbolsEnabled)
					))
					.filter(notEmpty);
			},
			results => {
				for (let i = 0; i < results.length; i++) {
					for (let j = 0; j < results.length; j++) {
						if (i === j) {
							continue;
						}
						results[i] = results[i].filter(child => {
							for (const parent of results[j]) {
								if (isInsideRange(parent.range, child.range)) {
									parent.children ??= [];
									parent.children.push(child);
									return false;
								}
							}
							return true;
						});
					}
				}
				return results.flat();
			}
		);
	};
}
