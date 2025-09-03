import type * as vscode from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import type { ServiceCodeLensData, ServiceReferencesCodeLensData } from './provideCodeLenses';
import * as references from './provideReferences';

export function register(context: LanguageServiceContext) {
	const findReferences = references.register(context);

	return async (item: vscode.CodeLens, token = NoneCancellationToken) => {
		const data: ServiceCodeLensData | ServiceReferencesCodeLensData | undefined = item.data;
		if (data?.kind === 'normal') {
			const plugin = context.plugins[data.pluginIndex];
			if (!plugin[1].resolveCodeLens) {
				delete item.data;
				return item;
			}

			Object.assign(item, data.original);
			item = await plugin[1].resolveCodeLens(item, token);

			// item.range already transformed in codeLens request
		}
		else if (data?.kind === 'references') {
			const references =
				await findReferences(URI.parse(data.sourceFileUri), item.range.start, { includeDeclaration: false }, token)
					?? [];

			item.command = context.commands.showReferences.create(data.sourceFileUri, item.range.start, references);
		}

		delete item.data;
		return item;
	};
}
