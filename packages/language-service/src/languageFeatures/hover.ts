import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServicePluginContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { isInsideRange } from '../utils/common';
import { errorMarkups } from './validation';

export function register(context: LanguageServicePluginContext) {

	return async (uri: string, position: vscode.Position, token = vscode.CancellationToken.None) => {

		let hover = await languageFeatureWorker(
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
				contents: {
					kind: vscode.MarkupKind.Markdown,
					value: hovers.map(getHoverTexts).flat().join('\n\n---\n\n'),
				},
				range: hovers.find(hover => hover.range && isInsideRange(hover.range, { start: position, end: position }))?.range ?? hovers[0].range,
			}),
		);

		const markups = errorMarkups[uri];
		if (markups) {
			for (const errorAndMarkup of markups) {
				if (isInsideRange(errorAndMarkup.error.range, { start: position, end: position })) {
					hover ??= {
						contents: {
							kind: vscode.MarkupKind.Markdown,
							value: '',
						},
					};
					hover.range = errorAndMarkup.error.range;
					if (!vscode.MarkupContent.is(hover.contents)) {
						hover.contents = {
							kind: vscode.MarkupKind.Markdown,
							value: hover.contents as string,
						};
					}
					if (hover.contents.value) {
						hover.contents.value += '\n\n---\n\n';
					}
					hover.contents.value += errorAndMarkup.markup.value;
				}
			}
		}

		return hover;
	};
}

function getHoverTexts(hover: vscode.Hover): string[] {
	if (typeof hover.contents === 'string') {
		return [hover.contents];
	}
	if (vscode.MarkupContent.is(hover.contents)) {
		return [hover.contents.value];
	}
	if (Array.isArray(hover.contents)) {
		return hover.contents.map(content => {
			if (typeof content === 'string') {
				return content;
			}
			return `\`\`\`${content.language}\n${content.value}\n\`\`\``;
		});
	}
	return [`\`\`\`${hover.contents.language}\n${hover.contents.value}\n\`\`\``];
}
