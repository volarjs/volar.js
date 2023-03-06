import type { LanguageServicePluginContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import * as transformer from '../transformer';
import * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common';

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
				for (let i = 0; i < results[0].length; i++) {
					const first = results[0][i];
					let lastParent = first;
					while (lastParent.parent) {
						lastParent = lastParent.parent;
					}
					for (let j = 1; j < results.length; j++) {
						const other = results[j][i];
						lastParent.parent = other;
						while (lastParent.parent) {
							lastParent = lastParent.parent;
						}
					}
				}
				return results[0];
			},
		);
	};
}
