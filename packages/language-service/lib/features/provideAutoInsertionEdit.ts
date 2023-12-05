import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { NoneCancellationToken } from '../utils/cancellation';
import { isAutoInsertEnabled } from '@volar/language-core';

export function register(context: ServiceContext) {

	return (uri: string, position: vscode.Position, lastChange: { range: vscode.Range; text: string; }, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => ({ position, lastChange }),
			function* (map) {
				for (const mappedPosition of map.getGeneratedPositions(position, isAutoInsertEnabled)) {
					const range = map.getGeneratedRange(lastChange.range);
					if (range) {
						yield {
							position: mappedPosition,
							lastChange: {
								text: lastChange.text,
								range,
							},
						};
					}
				}
			},
			(service, document, args) => {
				if (token.isCancellationRequested) {
					return;
				}
				return service[1].provideAutoInsertionEdit?.(document, args.position, args.lastChange, token);
			},
			(item, map) => {
				if (!map || typeof item === 'string') {
					return item;
				}
				const range = map.getSourceRange(item.range, isAutoInsertEnabled);
				if (range) {
					item.range = range;
					return item;
				}
			},
		);
	};
}
