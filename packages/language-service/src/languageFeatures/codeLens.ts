import type { ServiceContext } from '../types.js';
import { languageFeatureWorker } from '../utils/featureWorkers.js';
import type * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common.js';
import { NoneCancellationToken } from '../utils/cancellation.js';

export interface ServiceCodeLensData {
	kind: 'normal',
	uri: string,
	original: Pick<vscode.CodeLens, 'data'>,
	serviceId: string,
}

export interface ServiceReferencesCodeLensData {
	kind: 'references',
	uri: string,
	range: vscode.Range,
	serviceId: string,
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

				const serviceId = Object.keys(context.services).find(key => context.services[key] === service)!;

				codeLens?.forEach(codeLens => {
					codeLens.data = {
						kind: 'normal',
						uri,
						original: {
							data: codeLens.data,
						},
						serviceId: serviceId,
					} satisfies ServiceCodeLensData;
				});

				const ranges = await service.provideReferencesCodeLensRanges?.(document, token);
				const referencesCodeLens = ranges?.map<vscode.CodeLens>(range => ({
					range,
					data: {
						kind: 'references',
						uri,
						range,
						serviceId: serviceId,
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
