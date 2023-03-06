import type { LanguageServicePluginContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common';

export function register(context: LanguageServicePluginContext) {

	return (uri: string, position: vscode.Position, token = vscode.CancellationToken.None) => {

		return languageFeatureWorker(
			context,
			uri,
			position,
			(position, map) => map.toGeneratedPositions(position, data => !!data.completion),
			(plugin, document, position) => {

				if (token.isCancellationRequested)
					return;

				return plugin.provideLinkedEditingRanges?.(document, position, token);
			},
			(data, map) => map ? ({
				wordPattern: data.wordPattern,
				ranges: data.ranges.map(range => map.toSourceRange(range)).filter(notEmpty),
			}) : data,
		);
	};
}
