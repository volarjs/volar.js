import type { NullableResult, ServiceContext } from '../types.js';
import { languageFeatureWorker } from '../utils/featureWorkers.js';
import * as dedupe from '../utils/dedupe.js';
import type * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common.js';
import { NoneCancellationToken } from '../utils/cancellation.js';

export function register(context: ServiceContext) {

	return (uri: string, token = NoneCancellationToken): NullableResult<vscode.Location[]> => {

		return languageFeatureWorker(
			context,
			uri,
			undefined,
			function* (_) {
				yield _;
			},
			async (service, document) => {

				if (token.isCancellationRequested)
					return;

				return await service.provideFileReferences?.(document, token) ?? [];
			},
			(data) => data.map(reference => {

				if (!context.documents.isVirtualFileUri(reference.uri)) {
					return reference;
				}

				for (const [_, map] of context.documents.getMapsByVirtualFileUri(reference.uri)) {
					const range = map.toSourceRange(reference.range);
					if (range) {
						reference.uri = map.sourceFileDocument.uri;
						reference.range = range;
						return reference;
					}
				}
			}).filter(notEmpty),
			arr => dedupe.withLocations(arr.flat()),
		);
	};
}
