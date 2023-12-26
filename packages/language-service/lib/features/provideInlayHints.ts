import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { getOverlapRange, notEmpty } from '../utils/common';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { NoneCancellationToken } from '../utils/cancellation';
import { transformTextEdit } from '../utils/transform';
import { isInlayHintsEnabled } from '@volar/language-core';

export interface InlayHintData {
	uri: string;
	original: Pick<vscode.CodeAction, 'data' | 'edit'>;
	serviceIndex: number;
}

export function register(context: ServiceContext) {

	return async (uri: string, range: vscode.Range, token = NoneCancellationToken) => {

		const sourceFile = context.language.files.getSourceFile(context.env.uriToFileName(uri));
		if (!sourceFile) {
			return;
		}

		const document = context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);
		const offsetRange = {
			start: document.offsetAt(range.start),
			end: document.offsetAt(range.end),
		};

		return languageFeatureWorker(
			context,
			uri,
			() => range,
			function* (map) {

				/**
				 * copy from ./codeActions.ts
				 */

				if (!map.map.mappings.some(mapping => isInlayHintsEnabled(mapping.data))) {
					return;
				}

				let minStart: number | undefined;
				let maxEnd: number | undefined;

				for (const mapping of map.map.mappings) {
					const overlapRange = getOverlapRange(
						offsetRange.start,
						offsetRange.end,
						mapping.sourceOffsets[0],
						mapping.sourceOffsets[mapping.sourceOffsets.length - 1]
						+ mapping.lengths[mapping.lengths.length - 1]
					);
					if (overlapRange) {
						const start = map.map.getGeneratedOffset(overlapRange.start)?.[0];
						const end = map.map.getGeneratedOffset(overlapRange.end)?.[0];
						if (start !== undefined && end !== undefined) {
							minStart = minStart === undefined ? start : Math.min(start, minStart);
							maxEnd = maxEnd === undefined ? end : Math.max(end, maxEnd);
						}
					}
				}

				if (minStart !== undefined && maxEnd !== undefined) {
					yield {
						start: map.virtualFileDocument.positionAt(minStart),
						end: map.virtualFileDocument.positionAt(maxEnd),
					};
				}
			},
			async (service, document, arg) => {
				if (token.isCancellationRequested) {
					return;
				}
				const hints = await service[1].provideInlayHints?.(document, arg, token);
				hints?.forEach(link => {
					link.data = {
						uri,
						original: {
							data: link.data,
						},
						serviceIndex: context.services.indexOf(service),
					} satisfies InlayHintData;
				});

				return hints;
			},
			(inlayHints, map) => {
				if (!map) {
					return inlayHints;
				}
				return inlayHints
					.map((_inlayHint): vscode.InlayHint | undefined => {
						const position = map.getSourcePosition(_inlayHint.position, isInlayHintsEnabled);
						const edits = _inlayHint.textEdits
							?.map(textEdit => transformTextEdit(textEdit, range => map!.getSourceRange(range), map.virtualFileDocument))
							.filter(notEmpty);

						if (position) {
							return {
								..._inlayHint,
								position,
								textEdits: edits,
							};
						}
					})
					.filter(notEmpty);
			},
			arr => arr.flat(),
		);
	};
}
