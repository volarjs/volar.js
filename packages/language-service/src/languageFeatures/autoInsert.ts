import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServicePluginContext, AutoInsertionContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServicePluginContext) {

	return (uri: string, position: vscode.Position, autoInsertContext: AutoInsertionContext, token = vscode.CancellationToken.None) => {

		return languageFeatureWorker(
			context,
			uri,
			{ position, autoInsertContext },
			function* (arg, map) {
				for (const position of map.toGeneratedPositions(arg.position, data => !!data.completion)) {

					const rangeOffset = map.map.toGeneratedOffset(arg.autoInsertContext.lastChange.rangeOffset)?.[0];
					const range = map.toGeneratedRange(arg.autoInsertContext.lastChange.range);

					if (rangeOffset !== undefined && range) {
						yield {
							position,
							autoInsertContext: {
								lastChange: {
									...arg.autoInsertContext.lastChange,
									rangeOffset,
									range,
								},
							},
						};
						break;
					}
				}
			},
			(plugin, document, arg) => {
				if (token.isCancellationRequested)
					return;
				return plugin.provideAutoInsertionEdit?.(document, arg.position, arg.autoInsertContext, token);
			},
			(item, map) => {

				if (!map || typeof item === 'string')
					return item;

				const range = map.toSourceRange(item.range);
				if (range) {
					item.range = range;
					return item;
				}
			},
		);
	};
}
