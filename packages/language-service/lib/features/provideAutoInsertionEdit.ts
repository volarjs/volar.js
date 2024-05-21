import { isAutoInsertEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServiceContext) {

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
