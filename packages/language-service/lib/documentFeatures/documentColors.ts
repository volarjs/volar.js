import type { ServiceContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import type * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: ServiceContext) {

	return (uri: string, token = NoneCancellationToken) => {

		return documentFeatureWorker(
			context,
			uri,
			file => !!file.capabilities.documentSymbol, // TODO: add color capability setting
			(service, document) => {

				if (token.isCancellationRequested)
					return;

				return service.provideDocumentColors?.(document, token);
			},
			(data, map) => map ? data.map<vscode.ColorInformation | undefined>(color => {

				const range = map.toSourceRange(color.range);
				if (range) {
					return {
						range,
						color: color.color,
					};
				}
			}).filter(notEmpty) : data,
			arr => arr.flat(),
		);
	};
}
