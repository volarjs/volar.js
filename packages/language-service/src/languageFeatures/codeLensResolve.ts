import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types.js';
import type { ServiceCodeLensData, ServiceReferencesCodeLensData } from './codeLens.js';
import * as references from './references.js';
import { NoneCancellationToken } from '../utils/cancellation.js';

export function register(context: ServiceContext) {

	const findReferences = references.register(context);

	return async (item: vscode.CodeLens, token = NoneCancellationToken) => {

		const data: ServiceCodeLensData | ServiceReferencesCodeLensData | undefined = item.data;

		if (data?.kind === 'normal') {

			const service = context.services[data.serviceId];
			if (!service.resolveCodeLens)
				return item;

			Object.assign(item, data.original);
			item = await service.resolveCodeLens(item, token);

			// item.range already transformed in codeLens request
		}

		if (data?.kind === 'references') {

			let references = await findReferences(data.uri, item.range.start, token) ?? [];

			const service = context.services[data.serviceId];
			const document = context.getTextDocument(data.uri);

			if (document && service.resolveReferencesCodeLensLocations) {
				references = await service.resolveReferencesCodeLensLocations(document, data.range, references, token);
			}

			item.command = context.commands.showReferences.create(data.uri, data.range.start, references);
		}

		return item;
	};
}
