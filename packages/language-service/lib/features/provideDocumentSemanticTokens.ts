import { findOverlapCodeRange, isSemanticTokensEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { type URI } from 'vscode-uri';
import type { LanguageServiceContext, SemanticToken } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { getSourceRange, languageFeatureWorker } from '../utils/featureWorkers';
import { SemanticTokensBuilder } from '../utils/SemanticTokensBuilder';

export function register(context: LanguageServiceContext) {
	return async (
		uri: URI,
		range: vscode.Range | undefined,
		legend: vscode.SemanticTokensLegend,
		_reportProgress?: (tokens: vscode.SemanticTokens) => void, // TODO
		token = NoneCancellationToken,
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
			function*(docs) {
				const mapped = findOverlapCodeRange(
					docs[0].offsetAt(range.start),
					docs[0].offsetAt(range.end),
					docs[2],
					isSemanticTokensEnabled,
				);
				if (mapped) {
					yield {
						start: docs[1].positionAt(mapped.start),
						end: docs[1].positionAt(mapped.end),
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
			(tokens, docs) => {
				if (!docs) {
					return tokens;
				}
				return tokens
					.map<SemanticToken | undefined>(_token => {
						const range = getSourceRange(docs, {
							start: { line: _token[0], character: _token[1] },
							end: { line: _token[0], character: _token[1] + _token[2] },
						}, isSemanticTokensEnabled);
						if (range) {
							return [
								range.start.line,
								range.start.character,
								range.end.character - range.start.character,
								_token[3],
								_token[4],
							];
						}
					})
					.filter(token => !!token);
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
