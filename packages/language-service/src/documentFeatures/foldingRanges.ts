import type { LanguageServicePluginContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import * as transformer from '../transformer';
import * as vscode from 'vscode-languageserver-protocol';

export function register(context: LanguageServicePluginContext) {

	return (uri: string, token = vscode.CancellationToken.None) => {

		return documentFeatureWorker(
			context,
			uri,
			file => !!file.capabilities.foldingRange,
			(plugin, document) => {

				if (token.isCancellationRequested)
					return;

				return plugin.provideFoldingRanges?.(document, token);
			},
			(data, map) => map ? transformer.asFoldingRanges(data, range => map.toSourceRange(range)) : data,
			arr => arr.flat(),
		);
	};
}
