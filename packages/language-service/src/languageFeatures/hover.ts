import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServicePluginContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { isInsideRange } from '../utils/common';

export function register(context: LanguageServicePluginContext) {

	return (uri: string, position: vscode.Position, token = vscode.CancellationToken.None) => {

		return languageFeatureWorker(
			context,
			uri,
			position,
			(position, map) => map.toGeneratedPositions(position, data => !!data.hover),
			(plugin, document, position) => {

				if (token.isCancellationRequested)
					return;

				return plugin.provideHover?.(document, position, token);
			},
			(item, map) => {

				if (!map || !item.range)
					return item;

				const range = map.toSourceRange(item.range);
				if (range) {
					item.range = range;
					return item;
				}
			},
			hovers => ({
				contents: hovers.map(getHoverTexts).flat(),
				range: hovers.find(hover => hover.range && isInsideRange(hover.range, { start: position, end: position }))?.range ?? hovers[0].range,
			}),
		);
	};
}

function getHoverTexts(hover?: vscode.Hover) {
	if (!hover) {
		return [];
	}
	if (typeof hover.contents === 'string') {
		return [hover.contents];
	}
	if (vscode.MarkupContent.is(hover.contents)) {
		return [hover.contents.value];
	}
	if (Array.isArray(hover.contents)) {
		return hover.contents;
	}
	return [hover.contents.value];
}
