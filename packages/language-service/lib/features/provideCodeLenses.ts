import { isCodeLensEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { type URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { documentFeatureWorker, getSourceRange } from '../utils/featureWorkers';

export interface ServiceCodeLensData {
	kind: 'normal';
	uri: string;
	original: Pick<vscode.CodeLens, 'data'>;
	pluginIndex: number;
}

export interface ServiceReferencesCodeLensData {
	kind: 'references';
	sourceFileUri: string;
	workerFileUri: string;
	workerFileRange: vscode.Range;
	pluginIndex: number;
}

export function register(context: LanguageServiceContext) {
	return async (uri: URI, token = NoneCancellationToken) => {
		return await documentFeatureWorker(
			context,
			uri,
			docs => docs[2].mappings.some(mapping => isCodeLensEnabled(mapping.data)),
			async (plugin, document) => {
				if (token.isCancellationRequested) {
					return;
				}
				let codeLens = await plugin[1].provideCodeLenses?.(document, token);

				const pluginIndex = context.plugins.indexOf(plugin);

				codeLens?.forEach(codeLens => {
					if (plugin[1].resolveCodeLens) {
						codeLens.data = {
							kind: 'normal',
							uri: uri.toString(),
							original: {
								data: codeLens.data,
							},
							pluginIndex,
						} satisfies ServiceCodeLensData;
					}
					else {
						delete codeLens.data;
					}
				});

				const ranges = await plugin[1].provideReferencesCodeLensRanges?.(document, token);
				const referencesCodeLens = ranges?.map<vscode.CodeLens>(range => ({
					range,
					data: {
						kind: 'references',
						sourceFileUri: uri.toString(),
						workerFileUri: document.uri,
						workerFileRange: range,
						pluginIndex: pluginIndex,
					} satisfies ServiceReferencesCodeLensData,
				}));

				codeLens = [
					...codeLens ?? [],
					...referencesCodeLens ?? [],
				];

				return codeLens;
			},
			(data, docs) => {
				if (!docs) {
					return data;
				}
				return data
					.map(codeLens => {
						const range = getSourceRange(docs, codeLens.range, isCodeLensEnabled);
						if (range) {
							return {
								...codeLens,
								range,
							};
						}
					})
					.filter(codeLens => !!codeLens);
			},
			arr => arr.flat(),
		) ?? [];
	};
}
