import { isReferencesEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import type { LanguageServiceContext, NullableProviderResult, UriComponents } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import * as dedupe from '../utils/dedupe';
import { documentFeatureWorker, DocumentsAndMap, getSourceRange } from '../utils/featureWorkers';

export function register(context: LanguageServiceContext) {

	return (_uri: URI | UriComponents, token = NoneCancellationToken): NullableProviderResult<vscode.Location[]> => {
		const uri = _uri instanceof URI ? _uri : URI.from(_uri);

		return documentFeatureWorker(
			context,
			uri,
			() => true,
			async (plugin, document) => {
				if (token.isCancellationRequested) {
					return;
				}
				return await plugin[1].provideFileReferences?.(document, token) ?? [];
			},
			data => data
				.map(reference => {

					const decoded = context.decodeEmbeddedDocumentUri(URI.parse(reference.uri));
					const sourceScript = decoded && context.language.scripts.get(decoded[0]);
					const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

					if (!sourceScript || !virtualCode) {
						return reference;
					}

					const embeddedDocument = context.documents.get(
						context.encodeEmbeddedDocumentUri(sourceScript.id, virtualCode.id),
						virtualCode.languageId,
						virtualCode.snapshot
					);
					for (const [sourceScript, map] of context.language.maps.forEach(virtualCode)) {
						const sourceDocument = context.documents.get(sourceScript.id, sourceScript.languageId, sourceScript.snapshot);
						const docs: DocumentsAndMap = [sourceDocument, embeddedDocument, map];
						const range = getSourceRange(docs, reference.range, isReferencesEnabled);
						if (range) {
							reference.uri = sourceDocument.uri;
							reference.range = range;
							return reference;
						}
					}
				})
				.filter(reference => !!reference),
			arr => dedupe.withLocations(arr.flat())
		);
	};
}
