import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import type { ServiceCodeLensData, ServiceReferencesCodeLensData } from './codeLens';
import * as references from './references';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: ServiceContext) {

	const findReferences = references.register(context);

	return async (item: vscode.CodeLens, token = NoneCancellationToken) => {

		const data: ServiceCodeLensData | ServiceReferencesCodeLensData | undefined = item.data;

		if (data?.kind === 'normal') {

			const service = context.services[data.serviceIndex];
			if (!service.resolveCodeLens)
				return item;

			Object.assign(item, data.original);
			item = await service.resolveCodeLens(item, token);

			// item.range already transformed in codeLens request
		}

		if (data?.kind === 'references') {

			let references = await findReferences(data.uri, item.range.start, token) ?? [];

			const service = context.services[data.serviceIndex];

			if (service.resolveReferencesCodeLensLocations) {
				const file = context.project.fileProvider.getVirtualFile(data.uri)[0]
					?? context.project.fileProvider.getSourceFile(data.uri);
				if (file) {
					const document = context.documents.get(data.uri, file.languageId, file.snapshot);
					references = await service.resolveReferencesCodeLensLocations(document, data.range, references, token);
				}
			}

			item.command = context.commands.showReferences.create(data.uri, data.range.start, references);
		}

		return item;
	};
}
