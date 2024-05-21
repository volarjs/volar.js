import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { isEqualRange, isInsideRange, notEmpty } from '../utils/common';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { transformSelectionRanges } from '../utils/transform';
import { isSelectionRangesEnabled } from '@volar/language-core';

export function register(context: ServiceContext) {

	return (uri: string, positions: vscode.Position[], token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => positions,
			function* (map) {
				const result = positions
					.map(position => map.getGeneratedPosition(position, isSelectionRangesEnabled))
					.filter(notEmpty);
				if (result.length) {
					yield result;
				}
			},
			(service, document, positions) => {

				if (token.isCancellationRequested) {
					return;
				}

				return service[1].provideSelectionRanges?.(document, positions, token);
			},
			(data, map) => {
				if (!map) {
					return data;
				}
				return transformSelectionRanges(
					data,
					range => map.getSourceRange(range, isSelectionRangesEnabled)
				);
			},
			results => {
				const result: vscode.SelectionRange[] = [];
				for (let i = 0; i < positions.length; i++) {
					let pluginResults: vscode.SelectionRange[] = [];
					for (const ranges of results) {
						pluginResults.push(ranges[i]);
					}
					pluginResults = pluginResults.sort((a, b) => {
						if (isInsideRange(a.range, b.range)) {
							return 1;
						}
						if (isInsideRange(b.range, a.range)) {
							return -1;
						}
						return 0;
					});
					for (let j = 1; j < pluginResults.length; j++) {
						let top = pluginResults[j - 1];
						const parent = pluginResults[j];
						while (top.parent && isInsideRange(parent.range, top.parent.range) && !isEqualRange(parent.range, top.parent.range)) {
							top = top.parent;
						}
						if (top) {
							top.parent = parent;
						}
					}
					result.push(pluginResults[0]);
				}
				return result;
			},
		);
	};
}
