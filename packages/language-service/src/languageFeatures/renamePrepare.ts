import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServicePluginContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServicePluginContext) {

	return async (uri: string, position: vscode.Position) => {

		return languageFeatureWorker(
			context,
			uri,
			position,
			(position, map) => map.toGeneratedPositions(position, data => typeof data.rename === 'object' ? !!data.rename.apply : !!data.rename),
			(plugin, document, position) => plugin.rename?.prepare?.(document, position),
			(item, map) => {
				if (!map) {
					return item;
				}
				if (vscode.Range.is(item)) {
					return map.toSourceRange(item);
				}
			},
			prepares => {

				for (const prepare of prepares) {
					if (vscode.Range.is(prepare)) {
						return prepare; // if has any valid range, ignore other errors
					}
				}

				return prepares[0];
			},
		);
	};
}
