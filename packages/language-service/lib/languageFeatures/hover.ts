import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { isInsideRange } from '../utils/common';
import { errorMarkups } from './validation';
import { NoneCancellationToken } from '../utils/cancellation';
import { isHoverEnabled } from '@volar/language-core';

export function register(context: ServiceContext) {

	return async (uri: string, position: vscode.Position, token = NoneCancellationToken) => {

		let hover = await languageFeatureWorker(
			context,
			uri,
			() => position,
			map => map.toGeneratedPositions(position, isHoverEnabled),
			(service, document, position) => {
				if (token.isCancellationRequested) {
					return;
				}
				return service.provideHover?.(document, position, token);
			},
			(item, map) => {
				if (!map || !item.range) {
					return item;
				}
				item.range = map.toSourceRange(item.range, isHoverEnabled);
				return item;
			},
			(hovers): vscode.Hover => ({
				contents: {
					kind: 'markdown' satisfies typeof vscode.MarkupKind.Markdown,
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
							kind: 'markdown' satisfies typeof vscode.MarkupKind.Markdown,
							value: '',
						},
					};
					hover.range = errorAndMarkup.error.range;
					if (typeof hover.contents !== 'object' || typeof hover.contents !== 'string') {
						hover.contents = {
							kind: 'markdown' satisfies typeof vscode.MarkupKind.Markdown,
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
	if (Array.isArray(hover.contents)) {
		return hover.contents.map(content => {
			if (typeof content === 'string') {
				return content;
			}
			return `\`\`\`${content.language}\n${content.value}\n\`\`\``;
		});
	}
	if ('kind' in hover.contents) {
		return [hover.contents.value];
	}
	return [`\`\`\`${hover.contents.language}\n${hover.contents.value}\n\`\`\``];
}
