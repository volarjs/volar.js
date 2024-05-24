import { isInlayHintsEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { URI } from 'vscode-uri';
import type { ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { findOverlapCodeRange, notEmpty } from '../utils/common';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { transformTextEdit } from '../utils/transform';

export interface InlayHintData {
	uri: string;
	original: Pick<vscode.CodeAction, 'data' | 'edit'>;
	serviceIndex: number;
}

export function register(context: ServiceContext) {

	return async (uri: URI, range: vscode.Range, token = NoneCancellationToken) => {
		const sourceScript = context.language.scripts.get(uri);
		if (!sourceScript) {
			return;
		}

		return languageFeatureWorker(
			context,
			uri,
			() => range,
			function* (map) {
				const mapped = findOverlapCodeRange(
					map.sourceDocument.offsetAt(range.start),
					map.sourceDocument.offsetAt(range.end),
					map.map,
					isInlayHintsEnabled,
				);
				if (mapped) {
					yield {
						start: map.embeddedDocument.positionAt(mapped.start),
						end: map.embeddedDocument.positionAt(mapped.end),
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
						uri: uri.toString(),
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
							?.map(textEdit => transformTextEdit(textEdit, range => map.getSourceRange(range), map.embeddedDocument))
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
