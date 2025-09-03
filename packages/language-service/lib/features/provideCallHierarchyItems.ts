import { isCallHierarchyEnabled, isTypeHierarchyEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import * as dedupe from '../utils/dedupe';
import {
	type DocumentsAndMap,
	getGeneratedPositions,
	getSourceRange,
	languageFeatureWorker,
} from '../utils/featureWorkers';

export interface PluginCallHierarchyData {
	uri: string;
	original: Pick<vscode.CallHierarchyItem, 'data'>;
	pluginIndex: number;
	embeddedDocumentUri: string | undefined;
}

export function register(context: LanguageServiceContext) {
	return {
		getCallHierarchyItems(
			uri: URI,
			position: vscode.Position,
			token = NoneCancellationToken,
		) {
			return languageFeatureWorker(
				context,
				uri,
				() => position,
				docs => getGeneratedPositions(docs, position, isCallHierarchyEnabled),
				async (plugin, document, position, map) => {
					if (token.isCancellationRequested) {
						return;
					}
					const items = await plugin[1].provideCallHierarchyItems?.(document, position, token);
					items?.forEach(item => {
						item.data = {
							uri: uri.toString(),
							original: {
								data: item.data,
							},
							pluginIndex: context.plugins.indexOf(plugin),
							embeddedDocumentUri: map?.[1].uri,
						} satisfies PluginCallHierarchyData;
					});
					return items;
				},
				(data, map) => {
					if (!map) {
						return data;
					}
					return data
						.map(item => transformHierarchyItem(item, [])?.[0])
						.filter(item => !!item);
				},
				arr => dedupe.withLocations(arr.flat()),
			);
		},

		getTypeHierarchyItems(
			uri: URI,
			position: vscode.Position,
			token = NoneCancellationToken,
		) {
			return languageFeatureWorker(
				context,
				uri,
				() => position,
				docs => getGeneratedPositions(docs, position, isTypeHierarchyEnabled),
				async (plugin, document, position, map) => {
					if (token.isCancellationRequested) {
						return;
					}
					const items = await plugin[1].provideTypeHierarchyItems?.(document, position, token);
					items?.forEach(item => {
						item.data = {
							uri: uri.toString(),
							original: {
								data: item.data,
							},
							pluginIndex: context.plugins.indexOf(plugin),
							embeddedDocumentUri: map?.[1].uri,
						} satisfies PluginCallHierarchyData;
					});
					return items;
				},
				(data, map) => {
					if (!map) {
						return data;
					}
					return data
						.map(item => transformHierarchyItem(item, [])?.[0])
						.filter(item => !!item);
				},
				arr => dedupe.withLocations(arr.flat()),
			);
		},

		async getCallHierarchyIncomingCalls(item: vscode.CallHierarchyItem, token: vscode.CancellationToken) {
			const data: PluginCallHierarchyData | undefined = item.data;
			let incomingItems: vscode.CallHierarchyIncomingCall[] = [];

			if (data) {
				const plugin = context.plugins[data.pluginIndex];

				if (!plugin[1].provideCallHierarchyIncomingCalls) {
					return incomingItems;
				}

				Object.assign(item, data.original);

				if (data.embeddedDocumentUri) {
					const isEmbeddedContent = !!context.decodeEmbeddedDocumentUri(URI.parse(data.embeddedDocumentUri));

					if (isEmbeddedContent) {
						const _calls = await plugin[1].provideCallHierarchyIncomingCalls(item, token);

						for (const _call of _calls) {
							const calls = transformHierarchyItem(_call.from, _call.fromRanges);

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
					const _calls = await plugin[1].provideCallHierarchyIncomingCalls(item, token);

					for (const _call of _calls) {
						const calls = transformHierarchyItem(_call.from, _call.fromRanges);

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

		async getCallHierarchyOutgoingCalls(item: vscode.CallHierarchyItem, token: vscode.CancellationToken) {
			const data: PluginCallHierarchyData | undefined = item.data;
			let items: vscode.CallHierarchyOutgoingCall[] = [];

			if (data) {
				const plugin = context.plugins[data.pluginIndex];

				if (!plugin[1].provideCallHierarchyOutgoingCalls) {
					return items;
				}

				Object.assign(item, data.original);

				if (data.embeddedDocumentUri) {
					const isEmbeddedContent = !!context.decodeEmbeddedDocumentUri(URI.parse(data.embeddedDocumentUri));

					if (isEmbeddedContent) {
						const _calls = await plugin[1].provideCallHierarchyOutgoingCalls(item, token);

						for (const call of _calls) {
							const calls = transformHierarchyItem(call.to, call.fromRanges);

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
					const _calls = await plugin[1].provideCallHierarchyOutgoingCalls(item, token);

					for (const call of _calls) {
						const calls = transformHierarchyItem(call.to, call.fromRanges);

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

		async getTypeHierarchySupertypes(item: vscode.CallHierarchyItem, token: vscode.CancellationToken) {
			const data: PluginCallHierarchyData | undefined = item.data;

			if (data) {
				const plugin = context.plugins[data.pluginIndex];

				if (!plugin[1].provideTypeHierarchySupertypes) {
					return [];
				}

				Object.assign(item, data.original);

				if (data.embeddedDocumentUri) {
					const isEmbeddedContent = !!context.decodeEmbeddedDocumentUri(URI.parse(data.embeddedDocumentUri));

					if (isEmbeddedContent) {
						const items = await plugin[1].provideTypeHierarchySupertypes(item, token);

						return items
							.map(item => transformHierarchyItem(item, [])?.[0])
							.filter(item => !!item);
					}
				}
				else {
					const items = await plugin[1].provideTypeHierarchySupertypes(item, token);

					return items
						.map(item => transformHierarchyItem(item, [])?.[0])
						.filter(item => !!item);
				}
			}
		},

		async getTypeHierarchySubtypes(item: vscode.CallHierarchyItem, token: vscode.CancellationToken) {
			const data: PluginCallHierarchyData | undefined = item.data;

			if (data) {
				const plugin = context.plugins[data.pluginIndex];

				if (!plugin[1].provideTypeHierarchySubtypes) {
					return [];
				}

				Object.assign(item, data.original);

				if (data.embeddedDocumentUri) {
					const isEmbeddedContent = !!context.decodeEmbeddedDocumentUri(URI.parse(data.embeddedDocumentUri));

					if (isEmbeddedContent) {
						const items = await plugin[1].provideTypeHierarchySubtypes(item, token);

						return items
							.map(item => transformHierarchyItem(item, [])?.[0])
							.filter(item => !!item);
					}
				}
				else {
					const items = await plugin[1].provideTypeHierarchySubtypes(item, token);

					return items
						.map(item => transformHierarchyItem(item, [])?.[0])
						.filter(item => !!item);
				}
			}
		},
	};

	function transformHierarchyItem<T extends vscode.CallHierarchyItem | vscode.TypeHierarchyItem>(
		tsItem: T,
		tsRanges: vscode.Range[],
	): [T, vscode.Range[]] | undefined {
		const decoded = context.decodeEmbeddedDocumentUri(URI.parse(tsItem.uri));
		const sourceScript = decoded && context.language.scripts.get(decoded[0]);
		const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);
		if (!sourceScript || !virtualCode) {
			return [tsItem, tsRanges];
		}

		const embeddedDocument = context.documents.get(
			context.encodeEmbeddedDocumentUri(sourceScript.id, virtualCode.id),
			virtualCode.languageId,
			virtualCode.snapshot,
		);
		for (const [sourceScript, map] of context.language.maps.forEach(virtualCode)) {
			const sourceDocument = context.documents.get(sourceScript.id, sourceScript.languageId, sourceScript.snapshot);
			const docs: DocumentsAndMap = [sourceDocument, embeddedDocument, map];

			let range = getSourceRange(docs, tsItem.range);
			if (!range) {
				// TODO: <script> range
				range = {
					start: sourceDocument.positionAt(0),
					end: sourceDocument.positionAt(sourceDocument.getText().length),
				};
			}

			const selectionRange = getSourceRange(docs, tsItem.selectionRange);
			if (!selectionRange) {
				continue;
			}

			const vueRanges = tsRanges.map(tsRange => getSourceRange(docs, tsRange)).filter(range => !!range);
			const vueItem: T = {
				...tsItem,
				name: tsItem.name === embeddedDocument.uri.substring(embeddedDocument.uri.lastIndexOf('/') + 1)
					? sourceDocument.uri.substring(sourceDocument.uri.lastIndexOf('/') + 1)
					: tsItem.name,
				uri: sourceDocument.uri,
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
