import { isSymbolsEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { type URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { isInsideRange } from '../utils/common';
import { documentFeatureWorker, getSourceRange } from '../utils/featureWorkers';
import { transformDocumentSymbol } from '../utils/transform';

export function register(context: LanguageServiceContext) {
	return (uri: URI, token = NoneCancellationToken): Promise<vscode.DocumentSymbol[] | undefined> => {
		return documentFeatureWorker(
			context,
			uri,
			docs => docs[2].mappings.some(mapping => isSymbolsEnabled(mapping.data)),
			(plugin, document) => {
				if (token.isCancellationRequested) {
					return;
				}
				return plugin[1].provideDocumentSymbols?.(document, token);
			},
			(data, docs) => {
				if (!docs) {
					return data;
				}
				return data
					.map(symbol =>
						transformDocumentSymbol(
							symbol,
							range => getSourceRange(docs, range, isSymbolsEnabled),
						)
					)
					.filter(symbol => !!symbol);
			},
			results => {
				for (let i = 0; i < results.length; i++) {
					for (let j = 0; j < results.length; j++) {
						if (i === j) {
							continue;
						}
						results[i] = results[i].filter(child => {
							for (const parent of forEachSymbol(results[j])) {
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

function* forEachSymbol(symbols: vscode.DocumentSymbol[]): Generator<vscode.DocumentSymbol> {
	for (const symbol of symbols) {
		if (symbol.children) {
			yield* forEachSymbol(symbol.children);
		}
		yield symbol;
	}
}
