import type { ServiceContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import type * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common';
import { NoneCancellationToken } from '../utils/cancellation';
import { isColorEnabled } from '@volar/language-core';

export function register(context: ServiceContext) {

	return (uri: string, color: vscode.Color, range: vscode.Range, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => range,
			function* (map) {
				for (const mappedRange of map.toGeneratedRanges(range, isColorEnabled)) {
					yield mappedRange;
				}
			},
			(service, document, range) => {
				if (token.isCancellationRequested) {
					return;
				}
				return service.provideColorPresentations?.(document, color, range, token);
			},
			(data, map) => {
				if (!map) {
					return data;
				}
				return data
					.map(colorPresentation => {
						if (colorPresentation.textEdit) {
							const range = map.toSourceRange(colorPresentation.textEdit.range);
							if (!range)
								return undefined;
							colorPresentation.textEdit.range = range;
						}
						if (colorPresentation.additionalTextEdits) {
							for (const textEdit of colorPresentation.additionalTextEdits) {
								const range = map.toSourceRange(textEdit.range);
								if (!range)
									return undefined;
								textEdit.range = range;
							}
						}
						return colorPresentation;
					})
					.filter(notEmpty);
			},
		);
	};
}
