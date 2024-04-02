import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { NoneCancellationToken } from '../utils/cancellation';
import { isAutoInsertEnabled } from '@volar/language-core';

export function register(context: ServiceContext) {

	return (uri: string, selection: vscode.Position, change: { rangeOffset: number; rangeLength: number; text: string; }, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => ({ selection, change }),
			function* (map) {
				for (const mappedPosition of map.getGeneratedPositions(selection, isAutoInsertEnabled)) {
					const mapped = map.map.getGeneratedOffset(change.rangeOffset);
					if (mapped) {
						yield {
							selection: mappedPosition,
							change: {
								text: change.text,
								rangeOffset: mapped[0],
								rangeLength: change.rangeLength,
							},
						};
					}
				}
			},
			(service, document, args) => {
				if (token.isCancellationRequested) {
					return;
				}
				return service[1].provideAutoInsertionEdit?.(document, args.selection, args.change, token);
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
