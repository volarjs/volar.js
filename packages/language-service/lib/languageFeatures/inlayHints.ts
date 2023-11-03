import * as transformer from '../transformer';
import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { getOverlapRange, notEmpty } from '../utils/common';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { NoneCancellationToken } from '../utils/cancellation';

export interface InlayHintData {
	uri: string,
	original: Pick<vscode.CodeAction, 'data' | 'edit'>,
	serviceId: string,
}

export function register(context: ServiceContext) {

	return async (uri: string, range: vscode.Range, token = NoneCancellationToken) => {

		const document = context.getTextDocument(uri);

		if (!document)
			return;

		const offsetRange = {
			start: document.offsetAt(range.start),
			end: document.offsetAt(range.end),
		};

		return languageFeatureWorker(
			context,
			uri,
			range,
			(_arg, map, file) => {

				/**
				 * copy from ./codeActions.ts
				 */

				if (!file.capabilities.inlayHint)
					return [];

				let minStart: number | undefined;
				let maxEnd: number | undefined;

				for (const mapping of map.map.mappings) {
					const overlapRange = getOverlapRange(offsetRange.start, offsetRange.end, mapping.sourceRange[0], mapping.sourceRange[1]);
					if (overlapRange) {
						const start = map.map.toGeneratedOffset(overlapRange.start)?.[0];
						const end = map.map.toGeneratedOffset(overlapRange.end)?.[0];
						if (start !== undefined && end !== undefined) {
							minStart = minStart === undefined ? start : Math.min(start, minStart);
							maxEnd = maxEnd === undefined ? end : Math.max(end, maxEnd);
						}
					}
				}

				if (minStart !== undefined && maxEnd !== undefined) {
					return [{
						start: map.virtualFileDocument.positionAt(minStart),
						end: map.virtualFileDocument.positionAt(maxEnd),
					}];
				}

				return [];
			},
			async (service, document, arg) => {

				if (token.isCancellationRequested)
					return;

				const hints = await service.provideInlayHints?.(document, arg, token);
				hints?.forEach(link => {
					link.data = {
						uri,
						original: {
							data: link.data,
						},
						serviceId: Object.keys(context.services).find(key => context.services[key] === service)!,
					} satisfies InlayHintData;
				});

				return hints;
			},
			(inlayHints, map) => inlayHints.map((_inlayHint): vscode.InlayHint | undefined => {

				if (!map)
					return _inlayHint;

				const position = map.toSourcePosition(_inlayHint.position, data => !!data.semanticTokens /* todo */);
				const edits = _inlayHint.textEdits
					?.map(textEdit => transformer.asTextEdit(textEdit, range => map!.toSourceRange(range), map.virtualFileDocument))
					.filter(notEmpty);

				if (position) {
					return {
						..._inlayHint,
						position,
						textEdits: edits,
					};
				}
			}).filter(notEmpty),
			arr => arr.flat(),
		);
	};
}
