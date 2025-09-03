import { isHighlightEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import * as dedupe from '../utils/dedupe';
import {
	getGeneratedPositions,
	getLinkedCodePositions,
	getSourceRange,
	languageFeatureWorker,
} from '../utils/featureWorkers';

export function register(context: LanguageServiceContext) {
	return (uri: URI, position: vscode.Position, token = NoneCancellationToken) => {
		return languageFeatureWorker(
			context,
			uri,
			() => position,
			docs => getGeneratedPositions(docs, position, isHighlightEnabled),
			async (plugin, document, position) => {
				if (token.isCancellationRequested) {
					return;
				}

				const recursiveChecker = dedupe.createLocationSet();
				const result: vscode.DocumentHighlight[] = [];

				await withLinkedCode(document, position);

				return result;

				async function withLinkedCode(document: TextDocument, position: vscode.Position) {
					if (!plugin[1].provideDocumentHighlights) {
						return;
					}

					if (recursiveChecker.has({ uri: document.uri, range: { start: position, end: position } })) {
						return;
					}

					recursiveChecker.add({ uri: document.uri, range: { start: position, end: position } });

					const references = await plugin[1].provideDocumentHighlights(document, position, token) ?? [];

					for (const reference of references) {
						let foundMirrorPosition = false;

						recursiveChecker.add({
							uri: document.uri,
							range: { start: reference.range.start, end: reference.range.start },
						});

						const decoded = context.decodeEmbeddedDocumentUri(URI.parse(document.uri));
						const sourceScript = decoded && context.language.scripts.get(decoded[0]);
						const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);
						const linkedCodeMap = virtualCode && sourceScript
							? context.language.linkedCodeMaps.get(virtualCode)
							: undefined;

						if (sourceScript && virtualCode && linkedCodeMap) {
							const embeddedDocument = context.documents.get(
								context.encodeEmbeddedDocumentUri(sourceScript.id, virtualCode.id),
								virtualCode.languageId,
								virtualCode.snapshot,
							);
							for (const linkedPos of getLinkedCodePositions(embeddedDocument, linkedCodeMap, reference.range.start)) {
								if (recursiveChecker.has({ uri: embeddedDocument.uri, range: { start: linkedPos, end: linkedPos } })) {
									continue;
								}

								foundMirrorPosition = true;

								await withLinkedCode(embeddedDocument, linkedPos);
							}
						}

						if (!foundMirrorPosition) {
							result.push(reference);
						}
					}
				}
			},
			(data, docs) =>
				data
					.map(highlight => {
						if (!docs) {
							return highlight;
						}
						const range = getSourceRange(docs, highlight.range, isHighlightEnabled);
						if (range) {
							return {
								...highlight,
								range,
							};
						}
					})
					.filter(highlight => !!highlight),
			arr => arr.flat(),
		);
	};
}
