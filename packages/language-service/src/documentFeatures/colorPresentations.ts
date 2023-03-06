import type { LanguageServicePluginContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import * as vscode from 'vscode-languageserver-protocol';
import { notEmpty } from '../utils/common';

export function register(context: LanguageServicePluginContext) {

	return (uri: string, color: vscode.Color, range: vscode.Range, token = vscode.CancellationToken.None) => {

		return languageFeatureWorker(
			context,
			uri,
			range,
			(range, map, file) => {
				if (file.capabilities.documentSymbol) // TODO: add color capability setting
					return map.toGeneratedRanges(range);
				return [];
			},
			(plugin, document, range) => {

				if (token.isCancellationRequested)
					return;

				return plugin.provideColorPresentations?.(document, color, range, token);
			},
			(data, map) => map ? data.map(cp => {

				if (cp.textEdit) {
					const range = map.toSourceRange(cp.textEdit.range);
					if (!range)
						return undefined;
					cp.textEdit.range = range;
				}

				if (cp.additionalTextEdits) {
					for (const textEdit of cp.additionalTextEdits) {
						const range = map.toSourceRange(textEdit.range);
						if (!range)
							return undefined;
						textEdit.range = range;
					}
				}
				return cp;
			}).filter(notEmpty) : data,
		);
	};
}
