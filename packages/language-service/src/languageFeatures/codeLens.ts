import * as shared from '@volar/shared';
import type { LanguageServiceRuntimeContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { executePluginCommand, ExecutePluginCommandArgs } from './executeCommand';

import type * as _ from 'vscode-languageserver-protocol';

export interface PluginCodeLensData {
	uri: string,
	originalData: any,
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

				codeLens?.forEach(codeLens => {
					const pluginId = Object.keys(context.plugins).find(key => context.plugins[key] === plugin)!;
					if (codeLens.command) {
						codeLens.command = {
							title: codeLens.command.title,
							command: executePluginCommand,
							arguments: [uri, pluginId, codeLens.command]satisfies ExecutePluginCommandArgs,
						};
					}
					codeLens.data = {
						uri,
						originalData: codeLens.data,
						pluginId,
					} satisfies PluginCodeLensData;
				});

				return codeLens;
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
