import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServicePluginContext } from '../types';
import { documentFeatureWorker } from '../utils/featureWorkers';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SourceMapWithDocuments } from '../documents';
import { FileRangeCapabilities, VirtualFile } from '@volar/language-core';
import { notEmpty } from '../utils/common';

export function register(context: LanguageServicePluginContext) {

	return async (uri: string, token = vscode.CancellationToken.None) => {

		const pluginLinks = await documentFeatureWorker(
			context,
			uri,
			file => !!file.capabilities.documentSymbol,
			(plugin, document) => {
				if (token.isCancellationRequested)
					return;
				return plugin.provideLinks?.(document, token);
			},
			(data, map) => data.map(link => {

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
