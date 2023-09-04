import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types.js';
import { notEmpty } from '../utils/common.js';
import * as dedupe from '../utils/dedupe.js';
import { languageFeatureWorker } from '../utils/featureWorkers.js';
import { NoneCancellationToken } from '../utils/cancellation.js';
import { URI, Utils } from 'vscode-uri';

export interface PluginCallHierarchyData {
	uri: string,
	original: Pick<vscode.CallHierarchyItem, 'data'>,
	serviceId: string,
	virtualDocumentUri: string | undefined,
}

export function register(context: ServiceContext) {

	return {

		doPrepare(uri: string, position: vscode.Position, token = NoneCancellationToken) {

			return languageFeatureWorker(
				context,
				uri,
				position,
				(position, map) => map.toGeneratedPositions(position, data => !!data.references),
				async (service, document, position, map) => {

					if (token.isCancellationRequested)
						return;

					const items = await service.provideCallHierarchyItems?.(document, position, token);

					items?.forEach(item => {
						item.data = {
							uri,
							original: {
								data: item.data,
							},
							serviceId: Object.keys(context.services).find(key => context.services[key] === service)!,
							virtualDocumentUri: map?.virtualFileDocument.uri,
						} satisfies PluginCallHierarchyData;
					});

					return items;
				},
				(data, sourceMap) => !sourceMap ? data : data
					.map(item => transformCallHierarchyItem(item, [])?.[0])
					.filter(notEmpty),
				arr => dedupe.withLocations(arr.flat()),
			);
		},

		async getIncomingCalls(item: vscode.CallHierarchyItem, token: vscode.CancellationToken) {

			const data: PluginCallHierarchyData | undefined = item.data;
			let incomingItems: vscode.CallHierarchyIncomingCall[] = [];

			if (data) {

				const service = context.services[data.serviceId];

				if (!service.provideCallHierarchyIncomingCalls)
					return incomingItems;

				Object.assign(item, data.original);

				if (data.virtualDocumentUri) {

					if (context.documents.isVirtualFileUri(data.virtualDocumentUri)) {

						const _calls = await service.provideCallHierarchyIncomingCalls(item, token);

						for (const _call of _calls) {

							const calls = transformCallHierarchyItem(_call.from, _call.fromRanges);

							if (!calls)
								continue;

							incomingItems.push({
								from: calls[0],
								fromRanges: calls[1],
							});
						}
					}
				}
				else {

					const _calls = await service.provideCallHierarchyIncomingCalls(item, token);

					for (const _call of _calls) {

						const calls = transformCallHierarchyItem(_call.from, _call.fromRanges);

						if (!calls)
							continue;

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

				const service = context.services[data.serviceId];

				if (!service.provideCallHierarchyOutgoingCalls)
					return items;

				Object.assign(item, data.original);

				if (data.virtualDocumentUri) {

					if (context.documents.isVirtualFileUri(data.virtualDocumentUri)) {

						const _calls = await service.provideCallHierarchyOutgoingCalls(item, token);

						for (const call of _calls) {

							const calls = transformCallHierarchyItem(call.to, call.fromRanges);

							if (!calls)
								continue;

							items.push({
								to: calls[0],
								fromRanges: calls[1],
							});
						}
					}
				}
				else {

					const _calls = await service.provideCallHierarchyOutgoingCalls(item, token);

					for (const call of _calls) {

						const calls = transformCallHierarchyItem(call.to, call.fromRanges);

						if (!calls)
							continue;

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

		if (!context.documents.isVirtualFileUri(tsItem.uri))
			return [tsItem, tsRanges];

		for (const [_, map] of context.documents.getMapsByVirtualFileUri(tsItem.uri)) {

			let range = map.toSourceRange(tsItem.range);
			if (!range) {
				// TODO: <script> range
				range = {
					start: map.sourceFileDocument.positionAt(0),
					end: map.sourceFileDocument.positionAt(map.sourceFileDocument.getText().length),
				};
			}

			const selectionRange = map.toSourceRange(tsItem.selectionRange);
			if (!selectionRange)
				continue;

			const vueRanges = tsRanges.map(tsRange => map.toSourceRange(tsRange)).filter(notEmpty);
			const vueItem: vscode.CallHierarchyItem = {
				...tsItem,
				name: tsItem.name === Utils.basename(URI.parse(context.env.uriToFileName(map.virtualFileDocument.uri)))
					? Utils.basename(URI.parse(context.env.uriToFileName(map.sourceFileDocument.uri)))
					: tsItem.name,
				uri: map.sourceFileDocument.uri,
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

			selectionRange.end;

			return [vueItem, vueRanges];
		}
	}
}
