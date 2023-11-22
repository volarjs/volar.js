import type * as vscode from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import type { ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import type { DocumentLinkData } from './documentLinks';
import { MappingKey } from '@volar/language-core';

export function register(context: ServiceContext) {

	return async (item: vscode.DocumentLink, token = NoneCancellationToken) => {

		const data: DocumentLinkData | undefined = item.data;
		if (data) {
			const service = context.services[data.serviceIndex];
			if (!service.resolveDocumentLink)
				return item;

			Object.assign(item, data.original);
			item = await service.resolveDocumentLink(item, token);

			if (item.target) {
				item.target = transformDocumentLinkTarget(item.target, context);
			}
		}

		return item;
	};
}

export function transformDocumentLinkTarget(target: string, context: ServiceContext) {

	const targetUri = URI.parse(target);
	const clearUri = targetUri.with({ fragment: '' }).toString();
	const [virtualFile] = context.project.fileProvider.getVirtualFile(clearUri);

	if (virtualFile) {
		for (const map of context.documents.getMaps(virtualFile)) {

			if (!map.map.codeMappings.some(mapping => mapping[MappingKey.DATA].links ?? true)) {
				continue;
			}

			target = map.sourceFileDocument.uri;

			const hash = targetUri.fragment;
			const range = hash.match(/^L(\d+)(,(\d+))?(-L(\d+)(,(\d+))?)?$/);

			if (range) {
				const startLine = Number(range[1]) - 1;
				const startCharacter = Number(range[MappingKey.DATA] ?? 1) - 1;
				if (range[5] !== undefined) {
					const endLine = Number(range[5]) - 1;
					const endCharacter = Number(range[7] ?? 1) - 1;
					const sourceRange = map.toSourceRange({
						start: { line: startLine, character: startCharacter },
						end: { line: endLine, character: endCharacter },
					});
					if (sourceRange) {
						target += '#L' + (sourceRange.start.line + 1) + ',' + (sourceRange.start.character + 1);
						target += '-L' + (sourceRange.end.line + 1) + ',' + (sourceRange.end.character + 1);
						break;
					}
				}
				else {
					const sourcePos = map.toSourcePosition({ line: startLine, character: startCharacter });
					if (sourcePos) {
						target += '#L' + (sourcePos.line + 1) + ',' + (sourcePos.character + 1);
						break;
					}
				}
			}
		}
	}

	return target;
}
