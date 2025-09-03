import type { CodeInformation } from '@volar/language-core';
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
	getSourceRanges,
	languageFeatureWorker,
} from '../utils/featureWorkers';

export function register(
	context: LanguageServiceContext,
	apiName: 'provideDeclaration' | 'provideDefinition' | 'provideTypeDefinition' | 'provideImplementation',
	isValidPosition: (data: CodeInformation) => boolean,
) {
	return (uri: URI, position: vscode.Position, token = NoneCancellationToken) => {
		return languageFeatureWorker(
			context,
			uri,
			() => position,
			docs => getGeneratedPositions(docs, position, isValidPosition),
			async (plugin, document, position) => {
				if (token.isCancellationRequested) {
					return;
				}

				const recursiveChecker = dedupe.createLocationSet();
				const result: vscode.LocationLink[] = [];

				await withLinkedCode(document, position, undefined);

				return result;

				async function withLinkedCode(
					document: TextDocument,
					position: vscode.Position,
					originDefinition: vscode.LocationLink | undefined,
				) {
					const api = plugin[1][apiName];
					if (!api) {
						return;
					}

					if (recursiveChecker.has({ uri: document.uri, range: { start: position, end: position } })) {
						return;
					}

					recursiveChecker.add({ uri: document.uri, range: { start: position, end: position } });

					const definitions = await api?.(document, position, token) ?? [];

					for (const definition of definitions) {
						let foundMirrorPosition = false;

						recursiveChecker.add({
							uri: definition.targetUri,
							range: { start: definition.targetRange.start, end: definition.targetRange.start },
						});

						const decoded = context.decodeEmbeddedDocumentUri(URI.parse(definition.targetUri));
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
							for (
								const linkedPos of getLinkedCodePositions(
									embeddedDocument,
									linkedCodeMap,
									definition.targetSelectionRange.start,
								)
							) {
								if (recursiveChecker.has({ uri: embeddedDocument.uri, range: { start: linkedPos, end: linkedPos } })) {
									continue;
								}

								foundMirrorPosition = true;

								await withLinkedCode(embeddedDocument, linkedPos, originDefinition ?? definition);
							}
						}

						if (!foundMirrorPosition) {
							if (originDefinition) {
								result.push({
									...definition,
									originSelectionRange: originDefinition.originSelectionRange,
								});
							}
							else {
								result.push(definition);
							}
						}
					}
				}
			},
			(data, map) =>
				data.map(link => {
					if (link.originSelectionRange && map) {
						const originSelectionRange = toSourcePositionPreferSurroundedPosition(
							map,
							link.originSelectionRange,
							position,
						);

						if (!originSelectionRange) {
							return;
						}

						link.originSelectionRange = originSelectionRange;
					}

					let foundTargetSelectionRange = false;

					const decoded = context.decodeEmbeddedDocumentUri(URI.parse(link.targetUri));
					const sourceScript = decoded && context.language.scripts.get(decoded[0]);
					const targetVirtualFile = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

					if (sourceScript && targetVirtualFile) {
						const embeddedDocument = context.documents.get(
							context.encodeEmbeddedDocumentUri(sourceScript.id, targetVirtualFile.id),
							targetVirtualFile.languageId,
							targetVirtualFile.snapshot,
						);
						for (const [targetScript, targetSourceMap] of context.language.maps.forEach(targetVirtualFile)) {
							const sourceDocument = context.documents.get(
								targetScript.id,
								targetScript.languageId,
								targetScript.snapshot,
							);
							const docs: DocumentsAndMap = [sourceDocument, embeddedDocument, targetSourceMap];

							const targetSelectionRange = getSourceRange(docs, link.targetSelectionRange);
							if (!targetSelectionRange) {
								continue;
							}

							foundTargetSelectionRange = true;

							let targetRange = getSourceRange(docs, link.targetRange);

							link.targetUri = sourceDocument.uri;
							// loose range mapping to for template slots, slot properties
							link.targetRange = targetRange ?? targetSelectionRange;
							link.targetSelectionRange = targetSelectionRange;
						}

						if (apiName === 'provideDefinition' && !foundTargetSelectionRange) {
							for (const [targetScript] of context.language.maps.forEach(targetVirtualFile)) {
								if (targetScript.id.toString() !== uri.toString()) {
									return {
										...link,
										targetUri: targetScript.id.toString(),
										targetRange: {
											start: { line: 0, character: 0 },
											end: { line: 0, character: 0 },
										},
										targetSelectionRange: {
											start: { line: 0, character: 0 },
											end: { line: 0, character: 0 },
										},
									};
								}
							}
							return;
						}
					}

					return link;
				}).filter(link => !!link),
			arr => dedupe.withLocationLinks(arr.flat()),
		);
	};
}

function toSourcePositionPreferSurroundedPosition(
	docs: DocumentsAndMap,
	mappedRange: vscode.Range,
	position: vscode.Position,
) {
	let result: vscode.Range | undefined;

	for (const range of getSourceRanges(docs, mappedRange)) {
		if (!result) {
			result = range;
		}
		if (
			(range.start.line < position.line
				|| (range.start.line === position.line && range.start.character <= position.character))
			&& (range.end.line > position.line
				|| (range.end.line === position.line && range.end.character >= position.character))
		) {
			return range;
		}
	}

	return result;
}
