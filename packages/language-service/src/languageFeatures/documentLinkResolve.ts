import * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { DocumentLinkData } from './documentLinks';

export function register(context: ServiceContext) {

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
