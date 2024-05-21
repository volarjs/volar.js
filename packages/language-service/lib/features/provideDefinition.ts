import type { CodeInformation } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SourceMapWithDocuments } from '../documents';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { notEmpty } from '../utils/common';
import * as dedupe from '../utils/dedupe';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { URI } from 'vscode-uri';

export function register(
	context: LanguageServiceContext,
	apiName: 'provideDefinition' | 'provideTypeDefinition' | 'provideImplementation',
	isValidPosition: (data: CodeInformation) => boolean
) {

	return (uri: string, position: vscode.Position, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => position,
			map => map.getGeneratedPositions(position, isValidPosition),
			async (service, document, position) => {

				if (token.isCancellationRequested) {
					return;
				}

				const recursiveChecker = dedupe.createLocationSet();
				const result: vscode.LocationLink[] = [];

				await withLinkedCode(document, position, undefined);

				return result;

				async function withLinkedCode(document: TextDocument, position: vscode.Position, originDefinition: vscode.LocationLink | undefined) {

					const api = service[1][apiName];
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

						recursiveChecker.add({ uri: definition.targetUri, range: { start: definition.targetRange.start, end: definition.targetRange.start } });

						const decoded = context.decodeEmbeddedDocumentUri(URI.parse(definition.targetUri));
						const sourceScript = decoded && context.language.scripts.get(decoded[0]);
						const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);
						const linkedCodeMap = virtualCode && sourceScript
							? context.documents.getLinkedCodeMap(virtualCode, sourceScript.id)
							: undefined;

						if (linkedCodeMap) {

							for (const linkedPos of linkedCodeMap.getLinkedCodePositions(definition.targetSelectionRange.start)) {

								if (recursiveChecker.has({ uri: linkedCodeMap.document.uri, range: { start: linkedPos, end: linkedPos } })) {
									continue;
								}

								foundMirrorPosition = true;

								await withLinkedCode(linkedCodeMap.document, linkedPos, originDefinition ?? definition);
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
			(data, map) => data.map(link => {

				if (link.originSelectionRange && map) {

					const originSelectionRange = toSourcePositionPreferSurroundedPosition(map, link.originSelectionRange, position);

					if (!originSelectionRange) {
						return;
					}

					link.originSelectionRange = originSelectionRange;
				}

				let foundTargetSelectionRange = false;

				const decoded = context.decodeEmbeddedDocumentUri(URI.parse(link.targetUri));
				const sourceScript = decoded && context.language.scripts.get(decoded[0]);
				const targetVirtualFile = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

				if (targetVirtualFile) {

					for (const targetSourceMap of context.documents.getMaps(targetVirtualFile)) {

						const targetSelectionRange = targetSourceMap.getSourceRange(link.targetSelectionRange);
						if (!targetSelectionRange) {
							continue;
						}

						foundTargetSelectionRange = true;

						let targetRange = targetSourceMap.getSourceRange(link.targetRange);

						link.targetUri = targetSourceMap.sourceDocument.uri;
						// loose range mapping to for template slots, slot properties
						link.targetRange = targetRange ?? targetSelectionRange;
						link.targetSelectionRange = targetSelectionRange;
					}

					if (apiName === 'provideDefinition' && !foundTargetSelectionRange) {
						for (const targetMap of context.documents.getMaps(targetVirtualFile)) {
							if (targetMap && targetMap.sourceDocument.uri !== uri) {
								return {
									...link,
									targetUri: targetMap.sourceDocument.uri,
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
			}).filter(notEmpty),
			arr => dedupe.withLocationLinks(arr.flat()),
		);
	};
}

function toSourcePositionPreferSurroundedPosition(map: SourceMapWithDocuments, mappedRange: vscode.Range, position: vscode.Position) {

	let result: vscode.Range | undefined;

	for (const range of map.getSourceRanges(mappedRange)) {
		if (!result) {
			result = range;
		}
		if (
			(range.start.line < position.line || (range.start.line === position.line && range.start.character <= position.character))
			&& (range.end.line > position.line || (range.end.line === position.line && range.end.character >= position.character))
		) {
			return range;
		}
	}

	return result;
}
