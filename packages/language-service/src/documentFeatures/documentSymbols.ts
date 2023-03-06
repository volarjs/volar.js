import type { LanguageServicePluginContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import * as transformer from '../transformer';
import * as vscode from 'vscode-languageserver-protocol';
import { isInsideRange, notEmpty } from '../utils/common';

export function register(context: LanguageServicePluginContext) {

	return (uri: string, token = vscode.CancellationToken.None): Promise<vscode.DocumentSymbol[] | undefined> => {

		return documentFeatureWorker(
			context,
			uri,
			file => !!file.capabilities.documentSymbol,
			async (plugin, document) => {

				if (token.isCancellationRequested)
					return;

				return plugin.provideDocumentSymbols?.(document, token);
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
