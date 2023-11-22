import type * as vscode from 'vscode-languageserver-protocol';
import type { SemanticToken, ServiceContext } from '../types';
import { SemanticTokensBuilder } from '../utils/SemanticTokensBuilder';
import { NoneCancellationToken } from '../utils/cancellation';
import { notEmpty } from '../utils/common';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { MappingKey } from '@volar/language-core';

export function register(context: ServiceContext) {

	return async (
		uri: string,
		range: vscode.Range | undefined,
		legend: vscode.SemanticTokensLegend,
		token = NoneCancellationToken,
		_reportProgress?: (tokens: vscode.SemanticTokens) => void, // TODO
	): Promise<vscode.SemanticTokens | undefined> => {

		const sourceFile = context.project.fileProvider.getSourceFile(uri);
		if (!sourceFile)
			return;

		const document = context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);
		if (!range) {
			range = {
				start: { line: 0, character: 0 },
				end: { line: document.lineCount - 1, character: document.getText().length },
			};
		}

		const tokens = await languageFeatureWorker(
			context,
			uri,
			() => range!,
			function* (map) {

				let result: [number, number] | undefined;

				const start = document.offsetAt(range!.start);
				const end = document.offsetAt(range!.end);

				for (const mapping of map.map.codeMappings) {
					if (
						mapping[MappingKey.DATA].semanticTokens
						&& mapping[1][1] > start
						&& mapping[1][0] < end
					) {
						if (!result) {
							result = [...mapping[2]];
						}
						else {
							result[0] = Math.min(result[0], mapping[2][0]);
							result[1] = Math.max(result[1], mapping[2][1]);
						}
					}
				}

				if (result) {
					yield {
						start: map.virtualFileDocument.positionAt(result[0]),
						end: map.virtualFileDocument.positionAt(result[1]),
					};
				}
			},
			(service, document, range) => {

				if (token?.isCancellationRequested)
					return;

				return service.provideDocumentSemanticTokens?.(
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
						const range = map.toSourceRange({
							start: { line: _token[0], character: _token[1] },
							end: { line: _token[0], character: _token[1] + _token[2] },
						}, data => !!data.semanticTokens);
						if (range) {
							return [range.start.line, range.start.character, range.end.character - range.start.character, _token[MappingKey.DATA], _token[4]];
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
