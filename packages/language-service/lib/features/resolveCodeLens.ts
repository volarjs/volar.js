import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import type { ServiceCodeLensData, ServiceReferencesCodeLensData } from './provideCodeLenses';
import * as references from './provideReferences';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: ServiceContext) {

	const findReferences = references.register(context);

	return async (item: vscode.CodeLens, token = NoneCancellationToken) => {

		const data: ServiceCodeLensData | ServiceReferencesCodeLensData | undefined = item.data;

		if (data?.kind === 'normal') {

			const service = context.services[data.serviceIndex];
			if (!service[1].resolveCodeLens)
				return item;

			Object.assign(item, data.original);
			item = await service[1].resolveCodeLens(item, token);

			// item.range already transformed in codeLens request
		}

		if (data?.kind === 'references') {

			let references = await findReferences(data.sourceFileUri, item.range.start, token) ?? [];

			const service = context.services[data.serviceIndex];

			if (service[1].resolveReferencesCodeLensLocations) {
				const virtualFile = context.language.files.getVirtualFile(data.workerFileUri)[0];
				const sourceFile = context.language.files.getSourceFile(data.workerFileUri);
				if (virtualFile) {
					const document = context.documents.get(virtualFile.id, virtualFile.languageId, virtualFile.snapshot);
					references = await service[1].resolveReferencesCodeLensLocations(document, data.workerFileRange, references, token);
				}
				else if (sourceFile && !sourceFile?.virtualFile) {
					const document = context.documents.get(sourceFile.id, sourceFile.languageId, sourceFile.snapshot);
					references = await service[1].resolveReferencesCodeLensLocations(document, data.workerFileRange, references, token);
				}
			}

			item.command = context.commands.showReferences.create(data.sourceFileUri, item.range.start, references);
		}

		return item;
	};
}
