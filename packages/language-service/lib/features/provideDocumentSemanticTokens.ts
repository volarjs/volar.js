import { isSemanticTokensEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { URI } from 'vscode-uri';
import type { SemanticToken, LanguageServiceContext } from '../types';
import { SemanticTokensBuilder } from '../utils/SemanticTokensBuilder';
import { NoneCancellationToken } from '../utils/cancellation';
import { findOverlapCodeRange, notEmpty } from '../utils/common';
import { languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServiceContext) {

	return async (
		uri: URI,
		range: vscode.Range | undefined,
		legend: vscode.SemanticTokensLegend,
		token = NoneCancellationToken,
		_reportProgress?: (tokens: vscode.SemanticTokens) => void // TODO
	): Promise<vscode.SemanticTokens | undefined> => {
		const sourceScript = context.language.scripts.get(uri);
		if (!sourceScript) {
			return;
		}

		const document = context.documents.get(uri, sourceScript.languageId, sourceScript.snapshot);
		if (!range) {
			range = {
				start: { line: 0, character: 0 },
				end: { line: document.lineCount - 1, character: document.getText().length },
			};
		}

		const tokens = await languageFeatureWorker(
			context,
			uri,
			() => range,
			function* (map) {
				const mapped = findOverlapCodeRange(
					map.sourceDocument.offsetAt(range.start),
					map.sourceDocument.offsetAt(range.end),
					map.map,
					isSemanticTokensEnabled,
				);
				if (mapped) {
					yield {
						start: map.embeddedDocument.positionAt(mapped.start),
						end: map.embeddedDocument.positionAt(mapped.end),
					};
				}
			},
			(plugin, document, range) => {

				if (token?.isCancellationRequested) {
					return;
				}

				return plugin[1].provideDocumentSemanticTokens?.(
					document,
					range,
					legend,
					token,
				);
			},
			(tokens, map) => {
				if (!map) {
					return tokens;
				}
				return tokens
					.map<SemanticToken | undefined>(_token => {
						const range = map.getSourceRange({
							start: { line: _token[0], character: _token[1] },
							end: { line: _token[0], character: _token[1] + _token[2] },
						}, isSemanticTokensEnabled);
						if (range) {
							return [range.start.line, range.start.character, range.end.character - range.start.character, _token[3], _token[4]];
						}
					})
					.filter(notEmpty);
			},
			tokens => tokens.flat(),
			// tokens => reportProgress?.(buildTokens(tokens)), // TODO: this has no effect with LSP
		);
		if (tokens) {
			return buildTokens(tokens);
		}
	};
}

function buildTokens(tokens: SemanticToken[]) {
	const builder = new SemanticTokensBuilder();
	const sortedTokens = tokens.sort((a, b) => a[0] - b[0] === 0 ? a[1] - b[1] : a[0] - b[0]);
	for (const token of sortedTokens) {
		builder.push(...token);
	}
	return builder.build();
}
