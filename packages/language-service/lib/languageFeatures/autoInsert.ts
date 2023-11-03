import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext, AutoInsertionContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: ServiceContext) {

	return (uri: string, position: vscode.Position, autoInsertContext: AutoInsertionContext, token = NoneCancellationToken) => {

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
			(service, document, arg) => {
				if (token.isCancellationRequested)
					return;
				return service.provideAutoInsertionEdit?.(document, arg.position, arg.autoInsertContext, token);
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
