import { isCallHierarchyEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { notEmpty } from '../utils/common';
import * as dedupe from '../utils/dedupe';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { URI } from 'vscode-uri';

export interface PluginCallHierarchyData {
	uri: string;
	original: Pick<vscode.CallHierarchyItem, 'data'>;
	serviceIndex: number;
	embeddedDocumentUri: string | undefined;
}

export function register(context: ServiceContext) {

	return {

		doPrepare(uri: URI, position: vscode.Position, token = NoneCancellationToken) {

			return languageFeatureWorker(
				context,
				uri,
				() => position,
				map => map.getGeneratedPositions(position, data => isCallHierarchyEnabled(data)),
				async (service, document, position, map) => {
					if (token.isCancellationRequested) {
						return;
					}
					const items = await service[1].provideCallHierarchyItems?.(document, position, token);
					items?.forEach(item => {
						item.data = {
							uri: uri.toString(),
							original: {
								data: item.data,
							},
							serviceIndex: context.services.indexOf(service),
							embeddedDocumentUri: map?.embeddedDocument.uri,
						} satisfies PluginCallHierarchyData;
					});
					return items;
				},
				(data, map) => {
					if (!map) {
						return data;
					}
					return data
						.map(item => transformCallHierarchyItem(item, [])?.[0])
						.filter(notEmpty);
				},
				arr => dedupe.withLocations(arr.flat()),
			);
		},

		async getIncomingCalls(item: vscode.CallHierarchyItem, token: vscode.CancellationToken) {

			const data: PluginCallHierarchyData | undefined = item.data;
			let incomingItems: vscode.CallHierarchyIncomingCall[] = [];

			if (data) {

				const service = context.services[data.serviceIndex];

				if (!service[1].provideCallHierarchyIncomingCalls) {
					return incomingItems;
				}

				Object.assign(item, data.original);

				if (data.embeddedDocumentUri) {

					const isEmbeddedContent = !!context.decodeEmbeddedDocumentUri(URI.parse(data.embeddedDocumentUri));

					if (isEmbeddedContent) {

						const _calls = await service[1].provideCallHierarchyIncomingCalls(item, token);

						for (const _call of _calls) {

							const calls = transformCallHierarchyItem(_call.from, _call.fromRanges);

							if (!calls) {
								continue;
							}

							incomingItems.push({
								from: calls[0],
								fromRanges: calls[1],
							});
						}
					}
				}
				else {

					const _calls = await service[1].provideCallHierarchyIncomingCalls(item, token);

					for (const _call of _calls) {

						const calls = transformCallHierarchyItem(_call.from, _call.fromRanges);

						if (!calls) {
							continue;
						}

						incomingItems.push({
							from: calls[0],
							fromRanges: calls[1],
						});
					}
				}
			}

			return dedupe.withCallHierarchyIncomingCalls(incomingItems);
		},

		async getOutgoingCalls(item: vscode.CallHierarchyItem, token: vscode.CancellationToken) {

			const data: PluginCallHierarchyData | undefined = item.data;
			let items: vscode.CallHierarchyOutgoingCall[] = [];

			if (data) {

				const service = context.services[data.serviceIndex];

				if (!service[1].provideCallHierarchyOutgoingCalls) {
					return items;
				}

				Object.assign(item, data.original);

				if (data.embeddedDocumentUri) {

					const isEmbeddedContent = !!context.decodeEmbeddedDocumentUri(URI.parse(data.embeddedDocumentUri));

					if (isEmbeddedContent) {

						const _calls = await service[1].provideCallHierarchyOutgoingCalls(item, token);

						for (const call of _calls) {

							const calls = transformCallHierarchyItem(call.to, call.fromRanges);

							if (!calls) {
								continue;
							}

							items.push({
								to: calls[0],
								fromRanges: calls[1],
							});
						}
					}
				}
				else {

					const _calls = await service[1].provideCallHierarchyOutgoingCalls(item, token);

					for (const call of _calls) {

						const calls = transformCallHierarchyItem(call.to, call.fromRanges);

						if (!calls) {
							continue;
						}

						items.push({
							to: calls[0],
							fromRanges: calls[1],
						});
					}
				}
			}

			return dedupe.withCallHierarchyOutgoingCalls(items);
		},
	};

	function transformCallHierarchyItem(tsItem: vscode.CallHierarchyItem, tsRanges: vscode.Range[]): [vscode.CallHierarchyItem, vscode.Range[]] | undefined {

		const decoded = context.decodeEmbeddedDocumentUri(URI.parse(tsItem.uri));
		const sourceScript = decoded && context.language.scripts.get(decoded[0]);
		const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);
		if (!virtualCode) {
			return [tsItem, tsRanges];
		}

		for (const map of context.documents.getMaps(virtualCode)) {

			let range = map.getSourceRange(tsItem.range);
			if (!range) {
				// TODO: <script> range
				range = {
					start: map.sourceDocument.positionAt(0),
					end: map.sourceDocument.positionAt(map.sourceDocument.getText().length),
				};
			}

			const selectionRange = map.getSourceRange(tsItem.selectionRange);
			if (!selectionRange) {
				continue;
			}

			const vueRanges = tsRanges.map(tsRange => map.getSourceRange(tsRange)).filter(notEmpty);
			const vueItem: vscode.CallHierarchyItem = {
				...tsItem,
				name: tsItem.name === map.embeddedDocument.uri.substring(map.embeddedDocument.uri.lastIndexOf('/') + 1)
					? map.sourceDocument.uri.substring(map.sourceDocument.uri.lastIndexOf('/') + 1)
					: tsItem.name,
				uri: map.sourceDocument.uri,
				// TS Bug: `range: range` not works
				range: {
					start: range.start,
					end: range.end,
				},
				selectionRange: {
					start: selectionRange.start,
					end: selectionRange.end,
				},
			};

			return [vueItem, vueRanges];
		}
	}
}
