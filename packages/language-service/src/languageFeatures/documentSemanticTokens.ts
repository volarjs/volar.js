import * as vscode from 'vscode-languageserver-protocol';
import { SemanticToken } from '@volar/language-service';
import type { LanguageServicePluginContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { SemanticTokensBuilder } from '../utils/SemanticTokensBuilder';
import { notEmpty } from '../utils/common';

export function register(context: LanguageServicePluginContext) {

	return async (
		uri: string,
		range: vscode.Range | undefined,
		legend: vscode.SemanticTokensLegend,
		token = vscode.CancellationToken.None,
		reportProgress?: (tokens: vscode.SemanticTokens) => void,
	): Promise<vscode.SemanticTokens | undefined> => {

		const document = context.getTextDocument(uri);

		if (!document)
			return;

		const offsetRange: [number, number] = range ? [
			document.offsetAt(range.start),
			document.offsetAt(range.end),
		] : [
			0,
			document.getText().length,
		];

		const tokens = await languageFeatureWorker(
			context,
			uri,
			offsetRange,
			function* (offsetRange, map) {

				let range: [number, number] | undefined;

				for (const mapping of map.map.mappings) {

					if (
						mapping.data.semanticTokens
						&& mapping.sourceRange[1] > offsetRange[0]
						&& mapping.sourceRange[0] < offsetRange[1]
					) {
						if (!range) {
							range = [...mapping.generatedRange];
						}
						else {
							range[0] = Math.min(range[0], mapping.generatedRange[0]);
							range[1] = Math.max(range[1], mapping.generatedRange[1]);
						}
					}
				}

				if (range) {
					yield range;
				}
			},
			(plugin, document, offsetRange) => {

				if (token?.isCancellationRequested)
					return;

				return plugin.provideDocumentSemanticTokens?.(
					document,
					vscode.Range.create(document.positionAt(offsetRange[0]), document.positionAt(offsetRange[1])),
					legend,
					token,
				);
			},
			(tokens, map) => tokens.map<SemanticToken | undefined>(_token => {

				if (!map)
					return _token;

				const range = map.toSourceRange({
					start: { line: _token[0], character: _token[1] },
					end: { line: _token[0], character: _token[1] + _token[2] },
				}, data => !!data.semanticTokens);
				if (range) {
					return [range.start.line, range.start.character, range.end.character - range.start.character, _token[3], _token[4]];
				}
			}).filter(notEmpty),
			tokens => tokens.flat(),
			tokens => reportProgress?.(buildTokens(tokens)), // TODO: this has no effect with LSP
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
