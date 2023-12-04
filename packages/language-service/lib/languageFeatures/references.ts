import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import * as dedupe from '../utils/dedupe';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { NoneCancellationToken } from '../utils/cancellation';
import { isReferencesEnabled } from '@volar/language-core';

export function register(context: ServiceContext) {

	return (uri: string, position: vscode.Position, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => position,
			map => map.toGeneratedPositions(position, isReferencesEnabled),
			async (service, document, position) => {

				if (token.isCancellationRequested)
					return;

				const recursiveChecker = dedupe.createLocationSet();
				const result: vscode.Location[] = [];

				await withMirrors(document, position);

				return result;

				async function withMirrors(document: TextDocument, position: vscode.Position) {

					if (!service.provideReferences)
						return;

					if (recursiveChecker.has({ uri: document.uri, range: { start: position, end: position } }))
						return;

					recursiveChecker.add({ uri: document.uri, range: { start: position, end: position } });

					const references = await service.provideReferences(document, position, token) ?? [];

					for (const reference of references) {

						let foundMirrorPosition = false;

						recursiveChecker.add({ uri: reference.uri, range: { start: reference.range.start, end: reference.range.start } });

						const [virtualFile] = context.project.files.getVirtualFile(reference.uri);
						const mirrorMap = virtualFile ? context.documents.getLinkedCodeMap(virtualFile) : undefined;

						if (mirrorMap) {

							for (const linkedPos of mirrorMap.getLinkedCodePositions(reference.range.start)) {

								if (recursiveChecker.has({ uri: mirrorMap.document.uri, range: { start: linkedPos, end: linkedPos } }))
									continue;

								foundMirrorPosition = true;

								await withMirrors(mirrorMap.document, linkedPos);
							}
						}

						if (!foundMirrorPosition) {
							result.push(reference);
						}
					}
				}
			},
			(data) => {

				const results: vscode.Location[] = [];

				for (const reference of data) {

					const [virtualFile] = context.project.files.getVirtualFile(reference.uri);

					if (virtualFile) {
						for (const map of context.documents.getMaps(virtualFile)) {
							const range = map.toSourceRange(reference.range, isReferencesEnabled);
							if (range) {
								results.push({
									uri: map.sourceFileDocument.uri,
									range,
								});
							}
						}
					}
					else {
						results.push(reference);
					}
				}

				return results;
			},
			arr => dedupe.withLocations(arr.flat()),
		);
	};
}
