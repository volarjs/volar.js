import type { NullableResult, ServiceContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import * as dedupe from '../utils/dedupe';
import type * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common';
import { NoneCancellationToken } from '../utils/cancellation';
import { isReferencesEnabled } from '@volar/language-core';

export function register(context: ServiceContext) {

	return (uri: string, token = NoneCancellationToken): NullableResult<vscode.Location[]> => {

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

					const [virtualFile] = context.language.files.getVirtualFile(reference.uri);
					if (!virtualFile) {
						return reference;
					}

					for (const map of context.documents.getMaps(virtualFile)) {
						const range = map.getSourceRange(reference.range, isReferencesEnabled);
						if (range) {
							reference.uri = map.sourceFileDocument.uri;
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
