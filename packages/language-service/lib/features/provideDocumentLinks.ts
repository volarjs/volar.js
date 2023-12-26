import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { notEmpty } from '../utils/common';
import { documentFeatureWorker } from '../utils/featureWorkers';
import { transformDocumentLinkTarget } from './resolveDocumentLink';
import { isDocumentLinkEnabled } from '@volar/language-core';

export interface DocumentLinkData {
	uri: string;
	original: Pick<vscode.DocumentLink, 'data'>;
	serviceIndex: number;
}

export function register(context: ServiceContext) {

	return async (uri: string, token = NoneCancellationToken) => {

		return await documentFeatureWorker(
			context,
			uri,
			map => map.map.mappings.some(mapping => isDocumentLinkEnabled(mapping.data)),
			async (service, document) => {

				if (token.isCancellationRequested) {
					return;
				}

				const links = await service[1].provideDocumentLinks?.(document, token);

				for (const link of links ?? []) {
					link.data = {
						uri,
						original: {
							data: link.data,
						},
						serviceIndex: context.services.indexOf(service),
					} satisfies DocumentLinkData;
				}

				return links;
			},
			(links, map) => {
				if (!map) {
					return links;
				}
				return links
					.map(link => {
						const range = map.getSourceRange(link.range, isDocumentLinkEnabled);
						if (!range) {
							return;
						}
						link = {
							...link,
							range,
						};
						if (link.target) {
							link.target = transformDocumentLinkTarget(link.target, context);
						}
						return link;
					})
					.filter(notEmpty);
			},
			arr => arr.flat(),
		) ?? [];
	};
}
