import * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SourceMapWithDocuments } from '../documents';
import { FileRangeCapabilities, VirtualFile } from '@volar/language-core';
import { notEmpty } from '../utils/common';

export interface DocumentLinkData {
	uri: string,
	original: Pick<vscode.DocumentLink, 'data'>,
	pluginId: string,
}

export function register(context: ServiceContext) {

	return async (uri: string, token = vscode.CancellationToken.None) => {

		const pluginLinks = await documentFeatureWorker(
			context,
			uri,
			file => !!file.capabilities.documentSymbol,
			async (plugin, document) => {

				if (token.isCancellationRequested)
					return;

				const links = await plugin.provideDocumentLinks?.(document, token);

				links?.forEach(link => {
					link.data = {
						uri,
						original: {
							data: link.data,
						},
						pluginId: Object.keys(context.plugins).find(key => context.plugins[key] === plugin)!,
					} satisfies DocumentLinkData;
				});

				return links;
			},
			(links, map) => links.map(link => {

				if (!map)
					return link;

				const range = map.toSourceRange(link.range);
				if (range) {
					return {
						...link,
						range,
					};
				}
			}).filter(notEmpty),
			arr => arr.flat(),
		) ?? [];
		const maps = context.documents.getMapsBySourceFileUri(uri);
		const fictitiousLinks = maps ? getFictitiousLinks(context.documents.getDocumentByUri(maps.snapshot, uri), maps.maps) : [];

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
