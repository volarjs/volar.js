import * as transformer from '../transformer';
import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServicePluginContext } from '../types';
import { getOverlapRange, notEmpty } from '../utils/common';
import { languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServicePluginContext) {

	return async (uri: string, range: vscode.Range, token = vscode.CancellationToken.None) => {

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
					return [vscode.Range.create(
						map.virtualFileDocument.positionAt(minStart),
						map.virtualFileDocument.positionAt(maxEnd),
					)];
				}

				return [];
			},
			(plugin, document, arg) => {

				if (token.isCancellationRequested)
					return;

				return plugin.provideInlayHints?.(document, arg, token);
			},
			(inlayHints, map) => inlayHints.map((_inlayHint): vscode.InlayHint | undefined => {

				if (!map)
					return _inlayHint;

				const position = map.toSourcePosition(_inlayHint.position);
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
