import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServiceRuntimeContext } from '../types';
import { PluginCodeLensData, PluginReferencesCodeLensData } from './codeLens';
import * as references from './references';

export const showReferencesCommand = `volar.${Math.random().toString(36).slice(2)}.show-references`;

export type ShowReferencesCommandData = [string, vscode.Position, vscode.Location[]];

export function register(context: LanguageServiceRuntimeContext) {

	const findReferences = references.register(context);

	return async (item: vscode.CodeLens) => {

		const data: PluginCodeLensData | PluginReferencesCodeLensData | undefined = item.data;

		if (data?.kind === 'normal') {

			const plugin = context.plugins[data.pluginId];
			if (!plugin.codeLens?.resolve)
				return item;

			Object.assign(item, data.original);
			item = await plugin.codeLens.resolve(item);

			// item.range already transformed in codeLens request
		}

		if (data?.kind === 'references') {

			let references = await findReferences(data.uri, item.range.start) ?? [];

			const plugin = context.plugins[data.pluginId];
			const document = context.getTextDocument(data.uri);

			if (document && plugin.referencesCodeLens?.resolve) {
				references = await plugin.referencesCodeLens.resolve(document, data.location, references);
			}

			item.command = {
				title: references.length === 1 ? '1 reference' : `${references.length} references`,
				command: showReferencesCommand,
				arguments: [data.uri, data.location.range.start, references]satisfies ShowReferencesCommandData,
			};
		}

		return item;
	};
}
