import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { ServiceCodeActionData, RuleCodeActionData } from './codeActions';
import { embeddedEditToSourceEdit } from './rename';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: ServiceContext) {

	return async (item: vscode.CodeAction, token = NoneCancellationToken) => {

		const data: ServiceCodeActionData | RuleCodeActionData | undefined = item.data;

		if (data?.type === 'service') {

			const service = context.services[data.serviceId];
			if (!service.resolveCodeAction)
				return item;

			Object.assign(item, data.original);

			item = await service.resolveCodeAction(item, token);
			item = service.transformCodeAction?.(item)
				?? (
					item.edit
						? {
							...item,
							edit: embeddedEditToSourceEdit(
								item.edit,
								context.documents,
								'codeAction',
								{ [data.uri]: data.version },
							),
						}
						: item
				);
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
