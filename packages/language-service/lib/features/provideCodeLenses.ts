import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { notEmpty } from '../utils/common';
import { documentFeatureWorker } from '../utils/featureWorkers';
import { isCodeLensEnabled } from '@volar/language-core';

export interface ServiceCodeLensData {
	kind: 'normal';
	uri: string;
	original: Pick<vscode.CodeLens, 'data'>;
	serviceIndex: number;
}

export interface ServiceReferencesCodeLensData {
	kind: 'references';
	sourceFileUri: string;
	workerFileUri: string;
	workerFileRange: vscode.Range;
	serviceIndex: number;
}

export function register(context: ServiceContext) {

	return async (uri: string, token = NoneCancellationToken) => {

		return await documentFeatureWorker(
			context,
			uri,
			map => map.map.mappings.some(mapping => isCodeLensEnabled(mapping.data)),
			async (service, document) => {
				if (token.isCancellationRequested) {
					return;
				}
				let codeLens = await service[1].provideCodeLenses?.(document, token);

				const serviceIndex = context.services.indexOf(service);

				codeLens?.forEach(codeLens => {
					codeLens.data = {
						kind: 'normal',
						uri,
						original: {
							data: codeLens.data,
						},
						serviceIndex,
					} satisfies ServiceCodeLensData;
				});

				const ranges = await service[1].provideReferencesCodeLensRanges?.(document, token);
				const referencesCodeLens = ranges?.map<vscode.CodeLens>(range => ({
					range,
					data: {
						kind: 'references',
						sourceFileUri: uri,
						workerFileUri: document.uri,
						workerFileRange: range,
						serviceIndex,
					} satisfies ServiceReferencesCodeLensData,
				}));

				codeLens = [
					...codeLens ?? [],
					...referencesCodeLens ?? [],
				];

				return codeLens;
			},
			(data, map) => {
				if (!map) {
					return data;
				}
				return data
					.map(codeLens => {
						const range = map.getSourceRange(codeLens.range, isCodeLensEnabled);
						if (range) {
							return {
								...codeLens,
								range,
							};
						}
					})
					.filter(notEmpty);
			},
			arr => arr.flat(),
		) ?? [];
	};
}
