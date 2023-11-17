import type { ServiceContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import type * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common';
import { NoneCancellationToken } from '../utils/cancellation';

export interface ServiceCodeLensData {
	kind: 'normal',
	uri: string,
	original: Pick<vscode.CodeLens, 'data'>,
	serviceIndex: number,
}

export interface ServiceReferencesCodeLensData {
	kind: 'references',
	uri: string,
	range: vscode.Range,
	serviceIndex: number,
}

export function register(context: ServiceContext) {

	return async (uri: string, token = NoneCancellationToken) => {

		return await languageFeatureWorker(
			context,
			uri,
			undefined,
			(arg) => [arg],
			async (service, document) => {

				if (token.isCancellationRequested)
					return;

				let codeLens = await service.provideCodeLenses?.(document, token);

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

				const ranges = await service.provideReferencesCodeLensRanges?.(document, token);
				const referencesCodeLens = ranges?.map<vscode.CodeLens>(range => ({
					range,
					data: {
						kind: 'references',
						uri,
						range,
						serviceIndex,
					} satisfies ServiceReferencesCodeLensData,
				}));

				codeLens = [
					...codeLens ?? [],
					...referencesCodeLens ?? [],
				];

				return codeLens;
			},
			(data, map) => data.map(codeLens => {

				if (!map)
					return codeLens;

				const range = map.toSourceRange(codeLens.range);
				if (range) {
					return {
						...codeLens,
						range,
					};
				}
			}).filter(notEmpty),
			arr => arr.flat(),
		) ?? [];
	};
}
