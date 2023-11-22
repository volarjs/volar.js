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
			map => map.map.codeMappings.some(mapping => mapping[3].colors ?? true),
			(service, document) => {
				if (token.isCancellationRequested) {
					return;
				}
				return service.provideDocumentColors?.(document, token);
			},
			(data, map) => {
				if (!map) {
					return data;
				}
				return data
					.map<vscode.ColorInformation | undefined>(color => {
						const range = map.toSourceRange(color.range, data => data.colors ?? true);
						if (range) {
							return {
								range,
								color: color.color,
							};
						}
					})
					.filter(notEmpty);
			},
			arr => arr.flat(),
		);
	};
}
