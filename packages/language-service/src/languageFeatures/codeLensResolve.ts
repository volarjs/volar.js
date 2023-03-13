import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServicePluginContext } from '../types';
import { PluginCodeLensData, PluginReferencesCodeLensData } from './codeLens';
import * as references from './references';

export function register(context: LanguageServicePluginContext) {

	const findReferences = references.register(context);

	return async (item: vscode.CodeLens, token = vscode.CancellationToken.None) => {

		const data: PluginCodeLensData | PluginReferencesCodeLensData | undefined = item.data;

		if (data?.kind === 'normal') {

			const plugin = context.plugins[data.pluginId];
			if (!plugin.resolveCodeLens)
				return item;

			Object.assign(item, data.original);
			item = await plugin.resolveCodeLens(item, token);

			// item.range already transformed in codeLens request
		}

		if (data?.kind === 'references') {

			let references = await findReferences(data.uri, item.range.start, token) ?? [];

			const plugin = context.plugins[data.pluginId];
			const document = context.getTextDocument(data.uri);

			if (document && plugin.resolveReferencesCodeLensLocations) {
				references = await plugin.resolveReferencesCodeLensLocations(document, data.range, references, token);
			}

			item.command = context.commands.createShowReferencesCommand(data.uri, data.range.start, references);
		}

		return item;
	};
}
