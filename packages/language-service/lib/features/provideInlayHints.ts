import { findOverlapCodeRange, isInlayHintsEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { type URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { getSourcePositions, getSourceRange, languageFeatureWorker } from '../utils/featureWorkers';
import { transformTextEdit } from '../utils/transform';

export interface InlayHintData {
	uri: string;
	original: Pick<vscode.CodeAction, 'data' | 'edit'>;
	pluginIndex: number;
}

export function register(context: LanguageServiceContext) {
	return (uri: URI, range: vscode.Range, token = NoneCancellationToken) => {
		const sourceScript = context.language.scripts.get(uri);
		if (!sourceScript) {
			return;
		}

		return languageFeatureWorker(
			context,
			uri,
			() => range,
			function*(docs) {
				const mapped = findOverlapCodeRange(
					docs[0].offsetAt(range.start),
					docs[0].offsetAt(range.end),
					docs[2],
					isInlayHintsEnabled,
				);
				if (mapped) {
					yield {
						start: docs[1].positionAt(mapped.start),
						end: docs[1].positionAt(mapped.end),
					};
				}
			},
			async (plugin, document, arg) => {
				if (token.isCancellationRequested) {
					return;
				}
				const hints = await plugin[1].provideInlayHints?.(document, arg, token);
				hints?.forEach(link => {
					if (plugin[1].resolveInlayHint) {
						link.data = {
							uri: uri.toString(),
							original: {
								data: link.data,
							},
							pluginIndex: context.plugins.indexOf(plugin),
						} satisfies InlayHintData;
					}
					else {
						delete link.data;
					}
				});

				return hints;
			},
			(inlayHints, docs) => {
				if (!docs) {
					return inlayHints;
				}
				return inlayHints
					.map((_inlayHint): vscode.InlayHint | undefined => {
						const edits = _inlayHint.textEdits
							?.map(textEdit => transformTextEdit(textEdit, range => getSourceRange(docs, range), docs[1]))
							.filter(textEdit => !!textEdit);

						for (const position of getSourcePositions(docs, _inlayHint.position, isInlayHintsEnabled)) {
							return {
								..._inlayHint,
								position,
								textEdits: edits,
							};
						}
					})
					.filter(hint => !!hint);
			},
			arr => arr.flat(),
		);
	};
}
