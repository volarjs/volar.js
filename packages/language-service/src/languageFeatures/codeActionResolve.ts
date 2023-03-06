import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServicePluginContext } from '../types';
import { PluginCodeActionData, RuleCodeActionData } from './codeActions';
import { embeddedEditToSourceEdit } from './rename';

export function register(context: LanguageServicePluginContext) {

	return async (item: vscode.CodeAction, token = vscode.CancellationToken.None) => {

		const data: PluginCodeActionData | RuleCodeActionData | undefined = item.data;

		if (data?.type === 'plugin') {

			const plugin = context.plugins[data.pluginId];
			if (!plugin.resolveCodeAction)
				return item;

			Object.assign(item, data.original);

			item = await plugin.resolveCodeAction(item, token);

			if (item.edit) {
				item.edit = embeddedEditToSourceEdit(
					item.edit,
					context.documents,
					'codeAction',
					{ [data.uri]: data.version },
				);
			}
		}

		if (data?.type === 'rule') {
			const fixes = context.ruleFixes?.[data.documentUri]?.[data.ruleId]?.[data.ruleFixIndex];
			const fix = fixes?.[1][data.index];
			if (fix) {
				let edit = await fix.getWorkspaceEdit?.(fixes[0]) ?? undefined;
				if (!edit) {
					const edits = await fix.getEdits?.(fixes[0]);
					if (edits) {
						edit = {
							documentChanges: [{
								textDocument: {
									uri: data.documentUri,
									version: null
								},
								edits,
							}],
						};
					}
				}
				if (edit) {
					item.edit = embeddedEditToSourceEdit(
						edit,
						context.documents,
						data.isFormat ? 'format' : 'codeAction',
						{ [data.uri]: data.version },
					);
				}
			}
		}

		return item;
	};
}
