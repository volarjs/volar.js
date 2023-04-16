import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServicePluginContext } from '../types';
import { DocumentLinkData } from './documentLinks';

export function register(context: LanguageServicePluginContext) {

	return async (item: vscode.CodeLens, token = vscode.CancellationToken.None) => {

		const data: DocumentLinkData | undefined = item.data;
		if (data) {
			const plugin = context.plugins[data.pluginId];
			if (!plugin.resolveDocumentLink)
				return item;

			Object.assign(item, data.original);
			item = await plugin.resolveDocumentLink(item, token);
		}

		return item;
	};
}
