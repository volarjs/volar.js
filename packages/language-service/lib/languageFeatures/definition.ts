import { CodeInformation, MirrorCodeInformation } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SourceMapWithDocuments } from '../documents';
import type { ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { notEmpty } from '../utils/common';
import * as dedupe from '../utils/dedupe';
import { languageFeatureWorker } from '../utils/featureWorkers';

export function register(
	context: ServiceContext,
	apiName: 'provideDefinition' | 'provideTypeDefinition' | 'provideImplementation',
	isValidPosition: (data: CodeInformation) => boolean,
	isValidMirrorPosition: (mirrorData: MirrorCodeInformation) => boolean,
) {

	return (uri: string, position: vscode.Position, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => position,
			map => map.toGeneratedPositions(position, isValidPosition),
			async (service, document, position) => {

				if (token.isCancellationRequested) {
					return;
				}

				const recursiveChecker = dedupe.createLocationSet();
				const result: vscode.LocationLink[] = [];

				await withMirrors(document, position, undefined);

				return result;

				async function withMirrors(document: TextDocument, position: vscode.Position, originDefinition: vscode.LocationLink | undefined) {

					const api = service[apiName];
					if (!api)
						return;

					if (recursiveChecker.has({ uri: document.uri, range: { start: position, end: position } }))
						return;

					recursiveChecker.add({ uri: document.uri, range: { start: position, end: position } });

					const definitions = await api?.(document, position, token) ?? [];

					for (const definition of definitions) {

						let foundMirrorPosition = false;

						recursiveChecker.add({ uri: definition.targetUri, range: { start: definition.targetRange.start, end: definition.targetRange.start } });

						const [virtualFile] = context.project.fileProvider.getVirtualFile(definition.targetUri);
						const mirrorMap = virtualFile ? context.documents.getMirrorMap(virtualFile) : undefined;

						if (mirrorMap) {

							for (const mapped of mirrorMap.findMirrorPositions(definition.targetSelectionRange.start)) {

								if (!isValidMirrorPosition(mapped[1]))
									continue;

								if (recursiveChecker.has({ uri: mirrorMap.document.uri, range: { start: mapped[0], end: mapped[0] } }))
									continue;

								foundMirrorPosition = true;

								await withMirrors(mirrorMap.document, mapped[0], originDefinition ?? definition);
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

					if (!originSelectionRange)
						return;

					link.originSelectionRange = originSelectionRange;
				}

				let foundTargetSelectionRange = false;

				const [targetVirtualFile] = context.project.fileProvider.getVirtualFile(link.targetUri);

				if (targetVirtualFile) {

					for (const targetSourceMap of context.documents.getMaps(targetVirtualFile)) {

						const targetSelectionRange = targetSourceMap.toSourceRange(link.targetSelectionRange);
						if (!targetSelectionRange)
							continue;

						foundTargetSelectionRange = true;

						let targetRange = targetSourceMap.toSourceRange(link.targetRange);

						link.targetUri = targetSourceMap.sourceFileDocument.uri;
						// loose range mapping to for template slots, slot properties
						link.targetRange = targetRange ?? targetSelectionRange;
						link.targetSelectionRange = targetSelectionRange;
					}

					if (apiName === 'provideDefinition' && !foundTargetSelectionRange) {
						for (const targetMap of context.documents.getMaps(targetVirtualFile)) {
							if (targetMap && targetMap.sourceFileDocument.uri !== uri) {
								return {
									...link,
									targetUri: targetMap.sourceFileDocument.uri,
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

	for (const range of map.toSourceRanges(mappedRange)) {
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
