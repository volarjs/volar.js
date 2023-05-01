import type { ServiceContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common';

export function register(context: ServiceContext) {

	return (uri: string, token = vscode.CancellationToken.None) => {

		return documentFeatureWorker(
			context,
			uri,
			file => !!file.capabilities.documentSymbol, // TODO: add color capability setting
			(service, document) => {

				if (token.isCancellationRequested)
					return;

				return service.provideDocumentColors?.(document, token);
			},
			(data, map) => map ? data.map(color => {

				const range = map.toSourceRange(color.range);
				if (range) {
					return vscode.ColorInformation.create(range, color.color);
				}
			}).filter(notEmpty) : data,
			arr => arr.flat(),
		);
	};
}
