import * as transformer from '../transformer';
import type { FileRangeCapabilities } from '@volar/language-service';
import * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { LanguageServicePluginInstance, LanguageServicePluginContext } from '../types';
import { visitEmbedded } from '../utils/definePlugin';

export interface PluginCompletionData {
	uri: string;
	original: Pick<vscode.CompletionItem, 'additionalTextEdits' | 'textEdit' | 'data'>;
	pluginId: string;
	virtualDocumentUri: string | undefined;
}

export function register(context: LanguageServicePluginContext) {

	let cache: {
		uri: string,
		data: {
			virtualDocumentUri: string | undefined,
			plugin: LanguageServicePluginInstance,
			list: vscode.CompletionList,
		}[],
		mainCompletion: {
			documentUri: string,
		} | undefined,
	} | undefined;

	return async (
		uri: string,
		position: vscode.Position,
		completionContext: vscode.CompletionContext = { triggerKind: vscode.CompletionTriggerKind.Invoked, },
		token = vscode.CancellationToken.None,
	) => {

		let document: TextDocument | undefined;

		if (
			completionContext?.triggerKind === vscode.CompletionTriggerKind.TriggerForIncompleteCompletions
			&& cache?.uri === uri
		) {

			for (const cacheData of cache.data) {

				if (!cacheData.list.isIncomplete)
					continue;

				if (cacheData.virtualDocumentUri) {

					for (const [_, map] of context.documents.getMapsByVirtualFileUri(cacheData.virtualDocumentUri)) {

						for (const mapped of map.toGeneratedPositions(position, data => !!data.completion)) {

							if (!cacheData.plugin.provideCompletionItems)
								continue;

							const embeddedCompletionList = await cacheData.plugin.provideCompletionItems(map.virtualFileDocument, mapped, completionContext, token);

							if (!embeddedCompletionList) {
								cacheData.list.isIncomplete = false;
								continue;
							}

							cacheData.list = transformer.asCompletionList(
								embeddedCompletionList,
								range => map.toSourceRange(range),
								map.virtualFileDocument,
								(newItem, oldItem) => newItem.data = {
									uri,
									original: {
										additionalTextEdits: oldItem.additionalTextEdits,
										textEdit: oldItem.textEdit,
										data: oldItem.data,
									},
									pluginId: Object.keys(context.plugins).find(key => context.plugins[key] === cacheData.plugin)!,
									virtualDocumentUri: map.virtualFileDocument.uri,
								} satisfies PluginCompletionData,
							);
						}
					}
				}
				else if (document = context.getTextDocument(uri)) {

					if (!cacheData.plugin.provideCompletionItems)
						continue;

					const completionList = await cacheData.plugin.provideCompletionItems(document, position, completionContext, token);

					if (!completionList) {
						cacheData.list.isIncomplete = false;
						continue;
					}

					completionList.items.forEach(item => {
						item.data = {
							uri,
							original: {
								additionalTextEdits: item.additionalTextEdits,
								textEdit: item.textEdit,
								data: item.data,
							},
							pluginId: Object.keys(context.plugins).find(key => context.plugins[key] === cacheData.plugin)!,
							virtualDocumentUri: undefined,
						} satisfies PluginCompletionData;
					});
				}
			}
		}
		else {

			const rootFile = context.documents.getSourceByUri(uri)?.root;

			cache = {
				uri,
				data: [],
				mainCompletion: undefined,
			};

			// monky fix https://github.com/johnsoncodehk/volar/issues/1358
			let isFirstMapping = true;

			if (rootFile) {

				await visitEmbedded(context.documents, rootFile, async (_, map) => {

					const plugins = Object.values(context.plugins).sort(sortPlugins);

					let _data: FileRangeCapabilities | undefined;

					for (const mapped of map.toGeneratedPositions(position, data => {
						_data = data;
						return !!data.completion;
					})) {

						for (const plugin of plugins) {

							if (token.isCancellationRequested)
								break;

							if (!plugin.provideCompletionItems)
								continue;

							if (plugin.isAdditionalCompletion && !isFirstMapping)
								continue;

							if (completionContext?.triggerCharacter && !plugin.triggerCharacters?.includes(completionContext.triggerCharacter))
								continue;

							const isAdditional = _data && typeof _data.completion === 'object' && _data.completion.additional || plugin.isAdditionalCompletion;

							if (cache!.mainCompletion && (!isAdditional || cache?.mainCompletion.documentUri !== map.virtualFileDocument.uri))
								continue;

							// avoid duplicate items with .vue and .vue.html
							if (plugin.isAdditionalCompletion && cache?.data.some(data => data.plugin === plugin))
								continue;

							const embeddedCompletionList = await plugin.provideCompletionItems(map.virtualFileDocument, mapped, completionContext!, token);

							if (!embeddedCompletionList || !embeddedCompletionList.items.length)
								continue;

							if (typeof _data?.completion === 'object' && _data.completion.autoImportOnly) {
								embeddedCompletionList.items = embeddedCompletionList.items.filter(item => !!item.labelDetails);
							}

							if (!isAdditional) {
								cache!.mainCompletion = { documentUri: map.virtualFileDocument.uri };
							}

							const completionList = transformer.asCompletionList(
								embeddedCompletionList,
								range => map.toSourceRange(range),
								map.virtualFileDocument,
								(newItem, oldItem) => newItem.data = {
									uri,
									original: {
										additionalTextEdits: oldItem.additionalTextEdits,
										textEdit: oldItem.textEdit,
										data: oldItem.data,
									},
									pluginId: Object.keys(context.plugins).find(key => context.plugins[key] === plugin)!,
									virtualDocumentUri: map.virtualFileDocument.uri,
								} satisfies PluginCompletionData,
							);

							cache!.data.push({
								virtualDocumentUri: map.virtualFileDocument.uri,
								plugin,
								list: completionList,
							});
						}

						isFirstMapping = false;
					}

					return true;
				});
			}

			if (document = context.getTextDocument(uri)) {

				const plugins = Object.values(context.plugins).sort(sortPlugins);

				for (const plugin of plugins) {

					if (token.isCancellationRequested)
						break;

					if (!plugin.provideCompletionItems)
						continue;

					if (plugin.isAdditionalCompletion && !isFirstMapping)
						continue;

					if (completionContext?.triggerCharacter && !plugin.triggerCharacters?.includes(completionContext.triggerCharacter))
						continue;

					if (cache.mainCompletion && (!plugin.isAdditionalCompletion || cache.mainCompletion.documentUri !== document.uri))
						continue;

					// avoid duplicate items with .vue and .vue.html
					if (plugin.isAdditionalCompletion && cache?.data.some(data => data.plugin === plugin))
						continue;

					const completionList = await plugin.provideCompletionItems(document, position, completionContext, token);

					if (!completionList || !completionList.items.length)
						continue;

					if (!plugin.isAdditionalCompletion) {
						cache.mainCompletion = { documentUri: document.uri };
					}

					completionList.items.forEach(item => {
						item.data = {
							uri,
							original: {
								additionalTextEdits: item.additionalTextEdits,
								textEdit: item.textEdit,
								data: item.data,
							},
							pluginId: Object.keys(context.plugins).find(key => context.plugins[key] === plugin)!,
							virtualDocumentUri: undefined,
						} satisfies PluginCompletionData;
					});

					cache.data.push({
						virtualDocumentUri: undefined,
						plugin,
						list: completionList,
					});
				}
			}
		}

		return combineCompletionList(cache.data.map(cacheData => cacheData.list));

		function sortPlugins(a: LanguageServicePluginInstance, b: LanguageServicePluginInstance) {
			return (b.isAdditionalCompletion ? -1 : 1) - (a.isAdditionalCompletion ? -1 : 1);
		}

		function combineCompletionList(lists: vscode.CompletionList[]): vscode.CompletionList {
			return {
				isIncomplete: lists.some(list => list.isIncomplete),
				itemDefaults: lists.find(list => list.itemDefaults)?.itemDefaults,
				items: lists.map(list => list.items).flat(),
			};
		}
	};
}
