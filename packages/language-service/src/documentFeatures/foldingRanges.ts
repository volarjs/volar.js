import type { ServiceContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import * as transformer from '../transformer';
import * as vscode from 'vscode-languageserver-protocol';

export function register(context: ServiceContext) {

	return (uri: string, token = vscode.CancellationToken.None) => {

		return documentFeatureWorker(
			context,
			uri,
			file => !!file.capabilities.foldingRange,
			(service, document) => {

				if (token.isCancellationRequested)
					return;

				return service.provideFoldingRanges?.(document, token);
			},
			(data, map) => map ? transformer.asFoldingRanges(data, range => map.toSourceRange(range)) : data,
			arr => arr.flat(),
		);
	};
}
