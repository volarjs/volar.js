import { isCompletionEnabled, type CodeInformation } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import type { SourceMapWithDocuments } from '../documents';
import type { LanguageServicePluginInstance, ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { forEachEmbeddedDocument } from '../utils/featureWorkers';
import { transformCompletionList } from '../utils/transform';

export interface ServiceCompletionData {
	uri: string;
	original: Pick<vscode.CompletionItem, 'additionalTextEdits' | 'textEdit' | 'data'>;
	serviceIndex: number;
	embeddedDocumentUri: string | undefined;
}

export function register(context: ServiceContext) {

	let lastResult: {
		uri: URI;
		results: {
			embeddedDocumentUri: URI | undefined;
			service: LanguageServicePluginInstance;
			list: vscode.CompletionList | undefined | null;
		}[];
	} | undefined;

	return async (
		uri: URI,
		position: vscode.Position,
		completionContext: vscode.CompletionContext = { triggerKind: 1 satisfies typeof vscode.CompletionTriggerKind.Invoked, },
		token = NoneCancellationToken,
	) => {
		const sourceScript = context.language.scripts.get(uri);
		if (!sourceScript) {
			return {
				isIncomplete: false,
				items: [],
			};
		}

		if (
			completionContext?.triggerKind === 3 satisfies typeof vscode.CompletionTriggerKind.TriggerForIncompleteCompletions
			&& lastResult?.uri.toString() === uri.toString()
		) {

			for (const cacheData of lastResult.results) {

				if (!cacheData.list?.isIncomplete) {
					continue;
				}

				const serviceIndex = context.services.findIndex(service => service[1] === cacheData.service);

				if (cacheData.embeddedDocumentUri) {

					const decoded = context.decodeEmbeddedDocumentUri(cacheData.embeddedDocumentUri);
					const sourceScript = decoded && context.language.scripts.get(decoded[0]);
					const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

					if (!virtualCode) {
						continue;
					}

					for (const map of context.documents.getMaps(virtualCode)) {

						for (const mapped of map.getGeneratedPositions(position, data => isCompletionEnabled(data))) {

							if (!cacheData.service.provideCompletionItems) {
								continue;
							}

							cacheData.list = await cacheData.service.provideCompletionItems(map.embeddedDocument, mapped, completionContext, token);

							if (!cacheData.list) {
								continue;
							}

							for (const item of cacheData.list.items) {
								item.data = {
									uri: uri.toString(),
									original: {
										additionalTextEdits: item.additionalTextEdits,
										textEdit: item.textEdit,
										data: item.data,
									},
									serviceIndex,
									embeddedDocumentUri: map.embeddedDocument.uri,
								} satisfies ServiceCompletionData;
							}

							cacheData.list = transformCompletionList(
								cacheData.list,
								range => map.getSourceRange(range),
								map.embeddedDocument,
								context,
							);
						}
					}
				}
				else {

					if (!cacheData.service.provideCompletionItems) {
						continue;
					}

					const document = context.documents.get(uri, sourceScript.languageId, sourceScript.snapshot);
					cacheData.list = await cacheData.service.provideCompletionItems(document, position, completionContext, token);

					if (!cacheData.list) {
						continue;
					}

					for (const item of cacheData.list.items) {
						item.data = {
							uri: uri.toString(),
							original: {
								additionalTextEdits: item.additionalTextEdits,
								textEdit: item.textEdit,
								data: item.data,
							},
							serviceIndex,
							embeddedDocumentUri: undefined,
						} satisfies ServiceCompletionData;
					}
				}
			}
		}
		else {

			lastResult = {
				uri,
				results: [],
			};

			// monky fix https://github.com/johnsoncodehk/volar/issues/1358
			let isFirstMapping = true;
			let mainCompletionUri: string | undefined;

			const services = [...context.services]
				.filter(service => !context.disabledServicePlugins.has(service[1]))
				.sort((a, b) => sortServices(a[1], b[1]));

			const worker = async (
				document: TextDocument,
				position: vscode.Position,
				map?: SourceMapWithDocuments<CodeInformation>,
				codeInfo?: CodeInformation | undefined,
			) => {

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

					const isAdditional = (codeInfo && typeof codeInfo.completion === 'object' && codeInfo.completion.isAdditional) || service[1].isAdditionalCompletion;

					if (mainCompletionUri && (!isAdditional || mainCompletionUri !== document.uri)) {
						continue;
					}

					// avoid duplicate items with .vue and .vue.html
					if (service[1].isAdditionalCompletion && lastResult?.results.some(data => data.service === service[1])) {
						continue;
					}

					let completionList = await service[1].provideCompletionItems(document, position, completionContext, token);

					if (!completionList || !completionList.items.length) {
						continue;
					}

					if (typeof codeInfo?.completion === 'object' && codeInfo.completion.onlyImport) {
						completionList.items = completionList.items.filter(item => !!item.labelDetails);
					}

					if (!isAdditional) {
						mainCompletionUri = document.uri;
					}

					const serviceIndex = context.services.indexOf(service);

					for (const item of completionList.items) {
						item.data = {
							uri: uri.toString(),
							original: {
								additionalTextEdits: item.additionalTextEdits,
								textEdit: item.textEdit,
								data: item.data,
							},
							serviceIndex,
							embeddedDocumentUri: map ? document.uri : undefined,
						} satisfies ServiceCompletionData;
					}

					if (map) {
						completionList = transformCompletionList(
							completionList,
							range => map.getSourceRange(range, isCompletionEnabled),
							document,
							context,
						);
					}

					lastResult?.results.push({
						embeddedDocumentUri: map ? URI.parse(document.uri) : undefined,
						service: service[1],
						list: completionList,
					});
				}

				isFirstMapping = false;
			};

			if (sourceScript.generated) {

				for (const map of forEachEmbeddedDocument(context, sourceScript.id, sourceScript.generated.root)) {

					let _data: CodeInformation | undefined;

					for (const mappedPosition of map.getGeneratedPositions(position, data => {
						_data = data;
						return isCompletionEnabled(data);
					})) {
						await worker(map.embeddedDocument, mappedPosition, map, _data);
					}
				}
			}
			else {

				const document = context.documents.get(uri, sourceScript.languageId, sourceScript.snapshot);

				await worker(document, position);
			}
		}

		return combineCompletionList(lastResult.results.map(cacheData => cacheData.list));

		function sortServices(a: LanguageServicePluginInstance, b: LanguageServicePluginInstance) {
			return (b.isAdditionalCompletion ? -1 : 1) - (a.isAdditionalCompletion ? -1 : 1);
		}

		function combineCompletionList(lists: (vscode.CompletionList | undefined | null)[]): vscode.CompletionList {
			return {
				isIncomplete: lists.some(list => list?.isIncomplete),
				itemDefaults: lists.find(list => list?.itemDefaults)?.itemDefaults,
				items: lists.map(list => list?.items ?? []).flat(),
			};
		}
	};
}
