import type { LanguageServicePluginContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import * as transformer from '../transformer';
import * as shared from '@volar/shared';
import * as vscode from 'vscode-languageserver-protocol';

export function register(context: LanguageServicePluginContext) {

	return (uri: string): Promise<vscode.DocumentSymbol[] | undefined> => {

		return documentFeatureWorker(
			context,
			uri,
			file => !!file.capabilities.documentSymbol,
			async (plugin, document) => {
				const symbols = await plugin.findDocumentSymbols?.(document);
				if (!symbols?.length) {
					return symbols as vscode.DocumentSymbol[];
				}
				if (vscode.DocumentSymbol.is(symbols[0])) {
					return symbols as vscode.DocumentSymbol[];
				}
				return (symbols as vscode.SymbolInformation[]).map(symbol => {
					return vscode.DocumentSymbol.create(
						symbol.name,
						undefined,
						symbol.kind,
						symbol.location.range,
						symbol.location.range,
					);
				});
			},
			(data, map) => map
				? data
					.map(symbol => transformer.asDocumentSymbol(
						symbol,
						range => map.toSourceRange(range),
					))
					.filter(shared.notEmpty)
				: data,
			arr => arr.flat(),
		);
	};
}
