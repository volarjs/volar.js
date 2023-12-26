import { isCompletionEnabled, type CodeInformation } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext, ServicePluginInstance } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformCompletionList } from '../utils/transform';
import { visitEmbedded } from '../utils/featureWorkers';

export interface ServiceCompletionData {
	uri: string;
	original: Pick<vscode.CompletionItem, 'additionalTextEdits' | 'textEdit' | 'data'>;
	serviceIndex: number;
	virtualDocumentUri: string | undefined;
}

export function register(context: ServiceContext) {

	let cache: {
		uri: string,
		data: {
			virtualDocumentUri: string | undefined,
			service: ServicePluginInstance,
			serviceIndex: number,
			list: vscode.CompletionList,
		}[],
		mainCompletion: {
			documentUri: string,
		} | undefined,
	} | undefined;

	return async (
		uri: string,
		position: vscode.Position,
		completionContext: vscode.CompletionContext = { triggerKind: 1 satisfies typeof vscode.CompletionTriggerKind.Invoked, },
		token = NoneCancellationToken,
	) => {

		const sourceFile = context.language.files.getSourceFile(context.env.uriToFileName(uri));

		if (
			completionContext?.triggerKind === 3 satisfies typeof vscode.CompletionTriggerKind.TriggerForIncompleteCompletions
			&& cache?.uri === uri
		) {

			for (const cacheData of cache.data) {

				if (!cacheData.list.isIncomplete) {
					continue;
				}

				if (cacheData.virtualDocumentUri) {

					const [virtualFile] = context.language.files.getVirtualFile(context.env.uriToFileName(cacheData.virtualDocumentUri));
					if (!virtualFile) {
						continue;
					}

					for (const map of context.documents.getMaps(virtualFile)) {

						for (const mapped of map.getGeneratedPositions(position, data => isCompletionEnabled(data))) {

							if (!cacheData.service.provideCompletionItems) {
								continue;
							}

							const embeddedCompletionList = await cacheData.service.provideCompletionItems(map.virtualFileDocument, mapped, completionContext, token);

							if (!embeddedCompletionList) {
								cacheData.list.isIncomplete = false;
								continue;
							}

							cacheData.list = transformCompletionList(
								embeddedCompletionList,
								range => map.getSourceRange(range),
								map.virtualFileDocument,
								(newItem, oldItem) => newItem.data = {
									uri,
									original: {
										additionalTextEdits: oldItem.additionalTextEdits,
										textEdit: oldItem.textEdit,
										data: oldItem.data,
									},
									serviceIndex: cacheData.serviceIndex,
									virtualDocumentUri: map.virtualFileDocument.uri,
								} satisfies ServiceCompletionData,
							);
						}
					}
				}
				else if (sourceFile) {

					if (!cacheData.service.provideCompletionItems) {
						continue;
					}

					const document = context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);
					const completionList = await cacheData.service.provideCompletionItems(document, position, completionContext, token);

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
							serviceIndex: cacheData.serviceIndex,
							virtualDocumentUri: undefined,
						} satisfies ServiceCompletionData;
					});
				}
			}
		}
		else {

			const rootVirtualFile = context.language.files.getSourceFile(context.env.uriToFileName(uri))?.virtualFile?.[0];

			cache = {
				uri,
				data: [],
				mainCompletion: undefined,
			};

			// monky fix https://github.com/johnsoncodehk/volar/issues/1358
			let isFirstMapping = true;

			if (rootVirtualFile) {

				await visitEmbedded(context, rootVirtualFile, async (_, map) => {

					const services = [...context.services]
						.filter(service => !context.disabledServicePlugins.has(service[1]))
						.sort((a, b) => sortServices(a[1], b[1]));

					let _data: CodeInformation | undefined;

					for (const mapped of map.getGeneratedPositions(position, data => {
						_data = data;
						return isCompletionEnabled(data);
					})) {

						for (const service of services) {

							if (token.isCancellationRequested) {
								break;
							}

							if (!service[1].provideCompletionItems) {
								continue;
							}

							if (service[1].isAdditionalCompletion && !isFirstMapping) {
								continue;
							}

							if (completionContext?.triggerCharacter && !service[0].triggerCharacters?.includes(completionContext.triggerCharacter)) {
								continue;
							}

							const isAdditional = _data && typeof _data.completion === 'object' && _data.completion.isAdditional || service[1].isAdditionalCompletion;

							if (cache!.mainCompletion && (!isAdditional || cache?.mainCompletion.documentUri !== map.virtualFileDocument.uri)) {
								continue;
							}

							// avoid duplicate items with .vue and .vue.html
							if (service[1].isAdditionalCompletion && cache?.data.some(data => data.service === service[1])) {
								continue;
							}

							const embeddedCompletionList = await service[1].provideCompletionItems(map.virtualFileDocument, mapped, completionContext!, token);

							if (!embeddedCompletionList || !embeddedCompletionList.items.length) {
								continue;
							}

							if (typeof _data?.completion === 'object' && _data.completion.onlyImport) {
								embeddedCompletionList.items = embeddedCompletionList.items.filter(item => !!item.labelDetails);
							}

							if (!isAdditional) {
								cache!.mainCompletion = { documentUri: map.virtualFileDocument.uri };
							}

							const completionList = transformCompletionList(
								embeddedCompletionList,
								range => map.getSourceRange(range, isCompletionEnabled),
								map.virtualFileDocument,
								(newItem, oldItem) => newItem.data = {
									uri,
									original: {
										additionalTextEdits: oldItem.additionalTextEdits,
										textEdit: oldItem.textEdit,
										data: oldItem.data,
									},
									serviceIndex: context.services.indexOf(service),
									virtualDocumentUri: map.virtualFileDocument.uri,
								} satisfies ServiceCompletionData,
							);

							cache!.data.push({
								virtualDocumentUri: map.virtualFileDocument.uri,
								service: service[1],
								serviceIndex: context.services.indexOf(service),
								list: completionList,
							});
						}

						isFirstMapping = false;
					}

					return true;
				});
			}

			if (sourceFile) {

				const document = context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);
				const services = [...context.services]
					.filter(service => !context.disabledServicePlugins.has(service[1]))
					.sort((a, b) => sortServices(a[1], b[1]));

				for (const service of services) {

					if (token.isCancellationRequested) {
						break;
					}

					if (!service[1].provideCompletionItems) {
						continue;
					}

					if (service[1].isAdditionalCompletion && !isFirstMapping) {
						continue;
					}

					if (completionContext?.triggerCharacter && !service[0].triggerCharacters?.includes(completionContext.triggerCharacter)) {
						continue;
					}

					if (cache.mainCompletion && (!service[1].isAdditionalCompletion || cache.mainCompletion.documentUri !== document.uri)) {
						continue;
					}

					// avoid duplicate items with .vue and .vue.html
					if (service[1].isAdditionalCompletion && cache?.data.some(data => data.service === service[1])) {
						continue;
					}

					const completionList = await service[1].provideCompletionItems(document, position, completionContext, token);

					if (!completionList || !completionList.items.length) {
						continue;
					}

					if (!service[1].isAdditionalCompletion) {
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
							serviceIndex: context.services.indexOf(service),
							virtualDocumentUri: undefined,
						} satisfies ServiceCompletionData;
					});

					cache.data.push({
						virtualDocumentUri: undefined,
						service: service[1],
						serviceIndex: context.services.indexOf(service),
						list: completionList,
					});
				}
			}
		}

		return combineCompletionList(cache.data.map(cacheData => cacheData.list));

		function sortServices(a: ServicePluginInstance, b: ServicePluginInstance) {
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
