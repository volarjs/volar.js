import type { ServiceContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import * as transformer from '../transformer';
import type * as vscode from 'vscode-languageserver-protocol';
import { isInsideRange, notEmpty } from '../utils/common';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: ServiceContext) {

	return (uri: string, token = NoneCancellationToken): Promise<vscode.DocumentSymbol[] | undefined> => {

		return documentFeatureWorker(
			context,
			uri,
			file => !!file.capabilities.documentSymbol,
			async (service, document) => {

				if (token.isCancellationRequested)
					return;

				return service.provideDocumentSymbols?.(document, token);
			},
			(data, map) => map
				? data
					.map(symbol => transformer.asDocumentSymbol(
						symbol,
						range => map.toSourceRange(range),
					))
					.filter(notEmpty)
				: data,
			results => {
				for (let i = 0; i < results.length; i++) {
					for (let j = 0; j < results.length; j++) {
						if (i === j) continue;
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
