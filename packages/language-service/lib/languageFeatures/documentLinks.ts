import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SourceMapWithDocuments } from '../documents';
import { FileRangeCapabilities, VirtualFile } from '@volar/language-core';
import { notEmpty } from '../utils/common';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformDocumentLinkTarget } from './documentLinkResolve';

export interface DocumentLinkData {
	uri: string,
	original: Pick<vscode.DocumentLink, 'data'>,
	serviceIndex: number,
}

export function register(context: ServiceContext) {

	return async (uri: string, token = NoneCancellationToken) => {

		const pluginLinks = await documentFeatureWorker(
			context,
			uri,
			file => !!file.capabilities.documentSymbol,
			async (service, document) => {

				if (token.isCancellationRequested)
					return;

				const links = await service.provideDocumentLinks?.(document, token);

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
			(links, map) => links.map(link => {

				if (!map)
					return link;

				const range = map.toSourceRange(link.range);
				if (!range)
					return;

				link = {
					...link,
					range,
				};

				if (link.target)
					link.target = transformDocumentLinkTarget(link.target, context);

				return link;
			}).filter(notEmpty),
			arr => arr.flat(),
		) ?? [];
		const sourceFile = context.project.fileProvider.getSourceFile(uri);
		const maps = sourceFile ? context.documents.getMapsBySourceFile(sourceFile) : undefined;
		const fictitiousLinks = sourceFile && maps ? getFictitiousLinks(context.documents.getDocumentByUri(uri, sourceFile.languageId, sourceFile.snapshot), maps) : [];

		return [
			...pluginLinks,
			...fictitiousLinks,
		];

		function getFictitiousLinks(document: TextDocument, maps: [VirtualFile, SourceMapWithDocuments<FileRangeCapabilities>][]) {

			const result: vscode.DocumentLink[] = [];

			for (const [_, map] of maps) {

				for (const mapped of map.map.mappings) {

					if (!mapped.data.displayWithLink)
						continue;

					if (mapped.sourceRange[0] === mapped.sourceRange[1])
						continue;

					result.push({
						range: {
							start: document.positionAt(mapped.sourceRange[0]),
							end: document.positionAt(mapped.sourceRange[1]),
						},
						target: uri, // TODO
					});
				}
			}

			return result;
		}
	};
}
