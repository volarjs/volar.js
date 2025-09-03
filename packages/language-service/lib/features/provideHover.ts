import { isHoverEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { type URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { isInsideRange } from '../utils/common';
import { getGeneratedPositions, getSourceRange, languageFeatureWorker } from '../utils/featureWorkers';
import { transformMarkdown } from '../utils/transform';
import { errorMarkups } from './provideDiagnostics';

export function register(context: LanguageServiceContext) {
	return async (uri: URI, position: vscode.Position, token = NoneCancellationToken) => {
		let hover = await languageFeatureWorker(
			context,
			uri,
			() => position,
			docs => getGeneratedPositions(docs, position, isHoverEnabled),
			(plugin, document, position) => {
				if (token.isCancellationRequested) {
					return;
				}
				return plugin[1].provideHover?.(document, position, token);
			},
			(item, docs) => {
				if (!docs || !item.range) {
					return item;
				}
				item.range = getSourceRange(docs, item.range, isHoverEnabled);
				return item;
			},
			(hovers): vscode.Hover => ({
				contents: {
					kind: 'markdown' satisfies typeof vscode.MarkupKind.Markdown,
					value: hovers.map(getHoverTexts).flat().join('\n\n---\n\n'),
				},
				range:
					hovers.find(hover => hover.range && isInsideRange(hover.range, { start: position, end: position }))?.range
						?? hovers[0].range,
			}),
		);

		const markups = errorMarkups.get(uri);
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

	function getHoverTexts(hover: vscode.Hover): string[] {
		if (typeof hover.contents === 'string') {
			return [transformMarkdown(hover.contents, context)];
		}
		if (Array.isArray(hover.contents)) {
			return hover.contents.map(content => {
				if (typeof content === 'string') {
					return transformMarkdown(content, context);
				}
				if (content.language === 'md') {
					return `\`\`\`${content.language}\n${transformMarkdown(content.value, context)}\n\`\`\``;
				}
				else {
					return `\`\`\`${content.language}\n${content.value}\n\`\`\``;
				}
			});
		}
		if ('kind' in hover.contents) {
			if (hover.contents.kind === 'markdown') {
				return [transformMarkdown(hover.contents.value, context)];
			}
			else {
				return [hover.contents.value];
			}
		}
		if (hover.contents.language === 'md') {
			return [`\`\`\`${hover.contents.language}\n${transformMarkdown(hover.contents.value, context)}\n\`\`\``];
		}
		else {
			return [`\`\`\`${hover.contents.language}\n${hover.contents.value}\n\`\`\``];
		}
	}
}
