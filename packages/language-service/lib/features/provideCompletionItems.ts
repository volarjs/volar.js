import { isCompletionEnabled, type CodeInformation } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import type { SourceMapWithDocuments } from '../documents';
import type { LanguageServicePluginInstance, LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { forEachEmbeddedDocument } from '../utils/featureWorkers';
import { transformCompletionList } from '../utils/transform';

export interface ServiceCompletionData {
	uri: string;
	original: Pick<vscode.CompletionItem, 'additionalTextEdits' | 'textEdit' | 'data'>;
	pluginIndex: number;
	embeddedDocumentUri: string | undefined;
}

export function register(context: LanguageServiceContext) {

	let lastResult: {
		uri: URI;
		results: {
			embeddedDocumentUri: URI | undefined;
			plugin: LanguageServicePluginInstance;
			list: vscode.CompletionList | undefined | null;
		}[];
	} | undefined;

	return async (
		uri: URI,
		position: vscode.Position,
		completionContext: vscode.CompletionContext = { triggerKind: 1 satisfies typeof vscode.CompletionTriggerKind.Invoked, },
		token = NoneCancellationToken
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

				const pluginIndex = context.plugins.findIndex(plugin => plugin[1] === cacheData.plugin);

				if (cacheData.embeddedDocumentUri) {

					const decoded = context.decodeEmbeddedDocumentUri(cacheData.embeddedDocumentUri);
					const sourceScript = decoded && context.language.scripts.get(decoded[0]);
					const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

					if (!virtualCode) {
						continue;
					}

					const map = context.documents.getSourceMap(virtualCode);

					for (const mapped of map.getGeneratedPositions(position, data => isCompletionEnabled(data))) {

						if (!cacheData.plugin.provideCompletionItems) {
							continue;
						}

						cacheData.list = await cacheData.plugin.provideCompletionItems(map.embeddedDocument, mapped, completionContext, token);

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
								pluginIndex: pluginIndex,
								embeddedDocumentUri: map.embeddedDocument.uri,
							} satisfies ServiceCompletionData;
						}

						cacheData.list = transformCompletionList(
							cacheData.list,
							range => map.getSourceRange(range),
							map.embeddedDocument,
							context
						);
					}
				}
				else {

					if (!cacheData.plugin.provideCompletionItems) {
						continue;
					}

					const document = context.documents.get(uri, sourceScript.languageId, sourceScript.snapshot);
					cacheData.list = await cacheData.plugin.provideCompletionItems(document, position, completionContext, token);

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
							pluginIndex: pluginIndex,
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

			const sortedPlugins = [...context.plugins]
				.filter(plugin => !context.disabledServicePlugins.has(plugin[1]))
				.sort((a, b) => sortServices(a[1], b[1]));

			const worker = async (
				document: TextDocument,
				position: vscode.Position,
				map?: SourceMapWithDocuments,
				codeInfo?: CodeInformation | undefined
			) => {

				for (const plugin of sortedPlugins) {

					if (token.isCancellationRequested) {
						break;
					}

					if (!plugin[1].provideCompletionItems) {
						continue;
					}

					if (plugin[1].isAdditionalCompletion && !isFirstMapping) {
						continue;
					}

					if (completionContext?.triggerCharacter && !plugin[0].capabilities.completionProvider?.triggerCharacters?.includes(completionContext.triggerCharacter)) {
						continue;
					}

					const isAdditional = (codeInfo && typeof codeInfo.completion === 'object' && codeInfo.completion.isAdditional) || plugin[1].isAdditionalCompletion;

					if (mainCompletionUri && (!isAdditional || mainCompletionUri !== document.uri)) {
						continue;
					}

					// avoid duplicate items with .vue and .vue.html
					if (plugin[1].isAdditionalCompletion && lastResult?.results.some(data => data.plugin === plugin[1])) {
						continue;
					}

					let completionList = await plugin[1].provideCompletionItems(document, position, completionContext, token);

					if (!completionList || !completionList.items.length) {
						continue;
					}

					if (typeof codeInfo?.completion === 'object' && codeInfo.completion.onlyImport) {
						completionList.items = completionList.items.filter(item => !!item.labelDetails);
					}

					if (!isAdditional) {
						mainCompletionUri = document.uri;
					}

					const pluginIndex = context.plugins.indexOf(plugin);

					for (const item of completionList.items) {
						item.data = {
							uri: uri.toString(),
							original: {
								additionalTextEdits: item.additionalTextEdits,
								textEdit: item.textEdit,
								data: item.data,
							},
							pluginIndex,
							embeddedDocumentUri: map ? document.uri : undefined,
						} satisfies ServiceCompletionData;
					}

					if (map) {
						completionList = transformCompletionList(
							completionList,
							range => map.getSourceRange(range, isCompletionEnabled),
							document,
							context
						);
					}

					lastResult?.results.push({
						embeddedDocumentUri: map ? URI.parse(document.uri) : undefined,
						plugin: plugin[1],
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
