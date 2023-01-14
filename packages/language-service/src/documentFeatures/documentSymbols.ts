import type { LanguageServiceRuntimeContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import * as transformer from '../transformer';
import * as vscode from 'vscode-languageserver-protocol';

export function register(context: LanguageServiceRuntimeContext) {

	return (uri: string) => {

		return documentFeatureWorker(
			context,
			uri,
			file => !!file.capabilities.documentSymbol,
			(plugin, document) => plugin.findDocumentSymbols?.(document),
			(data, map) => map ? transformer.asSymbolInformations(
				data,
				location => {
					const range = map.toSourceRange(location.range);
					if (range) {
						return vscode.Location.create(map.sourceFileDocument.uri, range);
					}
				},
			) : data,
			arr => arr.flat(),
		);
	};
}
