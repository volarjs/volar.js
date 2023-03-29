import type { LanguageServicePluginContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import * as transformer from '../transformer';
import * as vscode from 'vscode-languageserver-protocol';
import { isInsideRange, notEmpty } from '../utils/common';

export function register(context: LanguageServicePluginContext) {

	return (uri: string, positions: vscode.Position[], token = vscode.CancellationToken.None) => {

		return languageFeatureWorker(
			context,
			uri,
			positions,
			(positions, map, file) => {
				if (file.capabilities.documentFormatting) {
					const result = positions
						.map(position => map.toGeneratedPosition(position))
						.filter(notEmpty);
					if (result.length) {
						return [result];
					}
				}
				return [];
			},
			(plugin, document, positions) => {

				if (token.isCancellationRequested)
					return;

				return plugin.provideSelectionRanges?.(document, positions, token);
			},
			(item, map) => map ? transformer.asSelectionRanges(item, range => map.toSourceRange(range)) : item,
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
					for (let i = 1; i < pluginResults.length; i++) {
						let root = pluginResults[i - 1];
						while (root.parent) {
							root = root.parent;
						}
						let parent: vscode.SelectionRange | undefined = pluginResults[i];
						while (parent && !isInsideRange(parent.range, root.range)) {
							parent = parent.parent;
						}
						if (parent) {
							root.parent = parent;
						}
					}
					result.push(pluginResults[0]);
				}
				return result;
			},
		);
	};
}
