import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types.js';
import { languageFeatureWorker } from '../utils/featureWorkers.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as dedupe from '../utils/dedupe.js';
import { notEmpty } from '../utils/common.js';
import { NoneCancellationToken } from '../utils/cancellation.js';

export function register(context: ServiceContext) {

	return (uri: string, position: vscode.Position, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			position,
			(position, map) => map.toGeneratedPositions(position,
				// note https://github.com/johnsoncodehk/volar/issues/2009
				data => typeof data.rename === 'object' ? !!data.rename.normalize : !!data.rename
			),
			async (service, document, position) => {

				if (token.isCancellationRequested)
					return;

				const recursiveChecker = dedupe.createLocationSet();
				const result: vscode.DocumentHighlight[] = [];

				await withMirrors(document, position);

				return result;

				async function withMirrors(document: TextDocument, position: vscode.Position) {

					if (!service.provideDocumentHighlights)
						return;

					if (recursiveChecker.has({ uri: document.uri, range: { start: position, end: position } }))
						return;

					recursiveChecker.add({ uri: document.uri, range: { start: position, end: position } });

					const references = await service.provideDocumentHighlights(document, position, token) ?? [];

					for (const reference of references) {

						let foundMirrorPosition = false;

						recursiveChecker.add({ uri: document.uri, range: { start: reference.range.start, end: reference.range.start } });

						const mirrorMap = context.documents.getMirrorMapByUri(document.uri)?.[1];

						if (mirrorMap) {

							for (const mapped of mirrorMap.findMirrorPositions(reference.range.start)) {

								if (!mapped[1].references)
									continue;

								if (recursiveChecker.has({ uri: mirrorMap.document.uri, range: { start: mapped[0], end: mapped[0] } }))
									continue;

								foundMirrorPosition = true;

								await withMirrors(mirrorMap.document, mapped[0]);
							}
						}

						if (!foundMirrorPosition) {
							result.push(reference);
						}
					}
				}
			},
			(data, map) => data.map(highlight => {

				if (!map)
					return highlight;

				const range = map.toSourceRange(highlight.range);
				if (range) {
					return {
						...highlight,
						range,
					};
				}
			}).filter(notEmpty),
			arr => arr.flat(),
		);
	};
}
