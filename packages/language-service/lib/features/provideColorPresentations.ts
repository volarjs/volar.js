import { isColorEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServiceContext) {

	return (uri: URI, color: vscode.Color, range: vscode.Range, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => range,
			function* (map) {
				for (const mappedRange of map.getGeneratedRanges(range, isColorEnabled)) {
					yield mappedRange;
				}
			},
			(plugin, document, range) => {
				if (token.isCancellationRequested) {
					return;
				}
				return plugin[1].provideColorPresentations?.(document, color, range, token);
			},
			(data, map) => {
				if (!map) {
					return data;
				}
				return data
					.map(colorPresentation => {
						if (colorPresentation.textEdit) {
							const range = map.getSourceRange(colorPresentation.textEdit.range);
							if (!range) {
								return undefined;
							}
							colorPresentation.textEdit.range = range;
						}
						if (colorPresentation.additionalTextEdits) {
							for (const textEdit of colorPresentation.additionalTextEdits) {
								const range = map.getSourceRange(textEdit.range);
								if (!range) {
									return undefined;
								}
								textEdit.range = range;
							}
						}
						return colorPresentation;
					})
					.filter(colorPresentation => !!colorPresentation);
			}
		);
	};
}
