import { isReferencesEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import * as dedupe from '../utils/dedupe';
import {
	type DocumentsAndMap,
	getGeneratedPositions,
	getLinkedCodePositions,
	getSourceRange,
	languageFeatureWorker,
} from '../utils/featureWorkers';

export function register(context: LanguageServiceContext) {
	return (
		uri: URI,
		position: vscode.Position,
		referenceContext: vscode.ReferenceContext,
		token = NoneCancellationToken,
	) => {
		return languageFeatureWorker(
			context,
			uri,
			() => position,
			docs => getGeneratedPositions(docs, position, isReferencesEnabled),
			async (plugin, document, position) => {
				if (token.isCancellationRequested) {
					return;
				}

				const recursiveChecker = dedupe.createLocationSet();
				const result: vscode.Location[] = [];

				await withLinkedCode(document, position);

				return result;

				async function withLinkedCode(document: TextDocument, position: vscode.Position) {
					if (!plugin[1].provideReferences) {
						return;
					}

					if (recursiveChecker.has({ uri: document.uri, range: { start: position, end: position } })) {
						return;
					}

					recursiveChecker.add({ uri: document.uri, range: { start: position, end: position } });

					const references = await plugin[1].provideReferences(document, position, referenceContext, token) ?? [];

					for (const reference of references) {
						let foundMirrorPosition = false;

						recursiveChecker.add({
							uri: reference.uri,
							range: { start: reference.range.start, end: reference.range.start },
						});

						const decoded = context.decodeEmbeddedDocumentUri(URI.parse(reference.uri));
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
			data => {
				const results: vscode.Location[] = [];

				for (const reference of data) {
					const decoded = context.decodeEmbeddedDocumentUri(URI.parse(reference.uri));
					const sourceScript = decoded && context.language.scripts.get(decoded[0]);
					const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

					if (sourceScript && virtualCode) {
						const embeddedDocument = context.documents.get(
							context.encodeEmbeddedDocumentUri(sourceScript.id, virtualCode.id),
							virtualCode.languageId,
							virtualCode.snapshot,
						);
						for (const [sourceScript, map] of context.language.maps.forEach(virtualCode)) {
							const sourceDocument = context.documents.get(
								sourceScript.id,
								sourceScript.languageId,
								sourceScript.snapshot,
							);
							const docs: DocumentsAndMap = [sourceDocument, embeddedDocument, map];
							const range = getSourceRange(docs, reference.range, isReferencesEnabled);
							if (range) {
								results.push({
									uri: sourceDocument.uri,
									range,
								});
							}
						}
					}
					else {
						results.push(reference);
					}
				}

				return results;
			},
			arr => dedupe.withLocations(arr.flat()),
		);
	};
}
