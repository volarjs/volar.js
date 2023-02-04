import * as shared from '@volar/shared';
import type { LanguageServiceRuntimeContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import * as vscode from 'vscode-languageserver-protocol';

export interface PluginCodeLensData {
	kind: 'normal',
	uri: string,
	original: Pick<vscode.CodeLens, 'data'>,
	pluginId: string,
}

export interface PluginReferencesCodeLensData {
	kind: 'references',
	uri: string,
	location: vscode.Location,
	pluginId: string,
}

export function register(context: LanguageServiceRuntimeContext) {

	return async (uri: string) => {

		return await languageFeatureWorker(
			context,
			uri,
			undefined,
			(arg) => [arg],
			async (plugin, document) => {

				const codeLens = await plugin.codeLens?.on?.(document);
				const pluginId = Object.keys(context.plugins).find(key => context.plugins[key] === plugin)!;

				codeLens?.forEach(codeLens => {
					codeLens.data = {
						kind: 'normal',
						uri,
						original: {
							data: codeLens.data,
						},
						pluginId,
					} satisfies PluginCodeLensData;
				});

				const referencesCodeLensLocs = await plugin.referencesCodeLens?.on?.(document);
				const referencesCodeLens = referencesCodeLensLocs?.map(loc => vscode.CodeLens.create(loc.range, {
					kind: 'references',
					uri,
					location: loc,
					pluginId,
				} satisfies PluginReferencesCodeLensData));

				return [
					...codeLens ?? [],
					...referencesCodeLens ?? [],
				];
			},
			(data, map) => data.map(codeLens => {

				if (!map)
					return codeLens;

				const range = map.toSourceRange(codeLens.range);
				if (range) {
					return {
						...codeLens,
						range,
					};
				}
			}).filter(shared.notEmpty),
			arr => arr.flat(),
		) ?? [];
	};
}
