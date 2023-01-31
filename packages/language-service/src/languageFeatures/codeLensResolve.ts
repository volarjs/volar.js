import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServiceRuntimeContext } from '../types';
import { PluginCodeLensData } from './codeLens';
import { executePluginCommand, ExecutePluginCommandArgs } from './executeCommand';

export function register(context: LanguageServiceRuntimeContext) {

	return async (item: vscode.CodeLens) => {

		const data: PluginCodeLensData = item.data;

		if (data) {

			const plugin = context.plugins[data.pluginId];

			if (!plugin.codeLens?.resolve)
				return item;

			Object.assign(item, data.original);
			item = await plugin.codeLens.resolve(item);

			if (item.command) {
				item.command = {
					title: item.command.title,
					command: executePluginCommand,
					arguments: [data.uri, data.pluginId, item.command]satisfies ExecutePluginCommandArgs,
				};
			}

			// item.range already transformed in codeLens request
		}

		return item;
	};
}
