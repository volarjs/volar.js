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

			const service = context.services[data.serviceIndex];
			if (!service[1].resolveCodeLens) {
				return item;
			}

			Object.assign(item, data.original);
			item = await service[1].resolveCodeLens(item, token);

			// item.range already transformed in codeLens request
		}

		if (data?.kind === 'references') {

			const references = await findReferences(URI.parse(data.sourceFileUri), item.range.start, { includeDeclaration: false }, token) ?? [];

			item.command = context.commands.showReferences.create(data.sourceFileUri, item.range.start, references);
		}

		return item;
	};
}
