import { isReferencesEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import type { NullableProviderResult, LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { notEmpty } from '../utils/common';
import * as dedupe from '../utils/dedupe';
import { documentFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServiceContext) {

	return (uri: string, token = NoneCancellationToken): NullableProviderResult<vscode.Location[]> => {

		return documentFeatureWorker(
			context,
			uri,
			() => true,
			async (service, document) => {
				if (token.isCancellationRequested) {
					return;
				}
				return await service[1].provideFileReferences?.(document, token) ?? [];
			},
			data => data
				.map(reference => {

					const decoded = context.decodeEmbeddedDocumentUri(URI.parse(reference.uri));
					const sourceScript = decoded && context.language.scripts.get(decoded[0]);
					const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

					if (!virtualCode) {
						return reference;
					}

					for (const map of context.documents.getMaps(virtualCode)) {
						const range = map.getSourceRange(reference.range, isReferencesEnabled);
						if (range) {
							reference.uri = map.sourceDocument.uri;
							reference.range = range;
							return reference;
						}
					}
				})
				.filter(notEmpty),
			arr => dedupe.withLocations(arr.flat()),
		);
	};
}
