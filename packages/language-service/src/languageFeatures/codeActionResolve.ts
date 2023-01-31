import type { CodeAction } from 'vscode-languageserver-protocol';
import type { LanguageServiceRuntimeContext } from '../types';
import { PluginCodeActionData, RuleCodeActionData } from './codeActions';
import { embeddedEditToSourceEdit } from './rename';

export function register(context: LanguageServiceRuntimeContext) {
	return async (item: CodeAction) => {

		const data: PluginCodeActionData | RuleCodeActionData | undefined = item.data;

		if (data?.type === 'plugin') {

			const plugin = context.plugins[data.pluginId];
			if (!plugin.codeAction?.resolve)
				return item;

			Object.assign(item, data.original);

			item = await plugin.codeAction.resolve(item);

			if (item.edit) {
				item.edit = embeddedEditToSourceEdit(
					item.edit,
					context.documents,
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
							changes: { [data.documentUri]: edits },
						};
					}
				}
				if (edit) {
					item.edit = embeddedEditToSourceEdit(edit, context.documents);
				}
			}
		}

		return item;
	};
}
