import type { ServiceContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import type * as vscode from 'vscode-languageserver-protocol';
import { isInsideRange, notEmpty } from '../utils/common';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformDocumentSymbol } from '../utils/transform';
import { isSymbolsEnabled } from '@volar/language-core';

export function register(context: ServiceContext) {

	return (uri: string, token = NoneCancellationToken): Promise<vscode.DocumentSymbol[] | undefined> => {

		return documentFeatureWorker(
			context,
			uri,
			map => map.map.mappings.some(mapping => isSymbolsEnabled(mapping.data)),
			async (service, document) => {
				if (token.isCancellationRequested) {
					return;
				}
				return service[1].provideDocumentSymbols?.(document, token);
			},
			(data, map) => {
				if (!map) {
					return data;
				}
				return data
					.map(symbol => transformDocumentSymbol(
						symbol,
						range => map.getSourceRange(range, isSymbolsEnabled),
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
			},
		);
	};
}
