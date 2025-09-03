import { isDocumentLinkEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { type URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { documentFeatureWorker, getSourceRange } from '../utils/featureWorkers';
import { transformDocumentLinkTarget } from '../utils/transform';

export interface DocumentLinkData {
	uri: string;
	original: Pick<vscode.DocumentLink, 'data'>;
	pluginIndex: number;
}

export function register(context: LanguageServiceContext) {
	return async (uri: URI, token = NoneCancellationToken) => {
		return await documentFeatureWorker(
			context,
			uri,
			docs => docs[2].mappings.some(mapping => isDocumentLinkEnabled(mapping.data)),
			async (plugin, document) => {
				if (token.isCancellationRequested) {
					return;
				}

				const links = await plugin[1].provideDocumentLinks?.(document, token);

				for (const link of links ?? []) {
					if (plugin[1].resolveDocumentLink) {
						link.data = {
							uri: uri.toString(),
							original: {
								data: link.data,
							},
							pluginIndex: context.plugins.indexOf(plugin),
						} satisfies DocumentLinkData;
					}
					else {
						delete link.data;
					}
				}

				return links;
			},
			(links, docs) => {
				if (!docs) {
					return links;
				}
				return links
					.map(link => {
						const range = getSourceRange(docs, link.range, isDocumentLinkEnabled);
						if (!range) {
							return;
						}
						link = {
							...link,
							range,
						};
						if (link.target) {
							link.target = transformDocumentLinkTarget(link.target, context).toString();
						}
						return link;
					})
					.filter(link => !!link);
			},
			arr => arr.flat(),
		) ?? [];
	};
}
