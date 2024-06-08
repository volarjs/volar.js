import { isDiagnosticsEnabled, shouldReportDiagnostics, type CodeInformation } from '@volar/language-core';
import type * as ts from 'typescript';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import type { SourceMapWithDocuments } from '../documents';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { notEmpty, sleep } from '../utils/common';
import * as dedupe from '../utils/dedupe';
import { documentFeatureWorker } from '../utils/featureWorkers';
import { createUriMap } from '../utils/uriMap';

export function updateRange(
	range: vscode.Range,
	change: {
		range: vscode.Range,
		newEnd: vscode.Position;
	}
) {
	if (!updatePosition(range.start, change, false)) {
		return;
	}
	if (!updatePosition(range.end, change, true)) {
		return;
	}
	if (range.end.line === range.start.line && range.end.character <= range.start.character) {
		range.end.character++;
	}
	return range;
}

function updatePosition(
	position: vscode.Position,
	change: {
		range: vscode.Range,
		newEnd: vscode.Position;
	},
	isEnd: boolean
) {
	if (change.range.end.line > position.line) {
		if (change.newEnd.line > position.line) {
			// No change
			return true;
		}
		else if (change.newEnd.line === position.line) {
			position.character = Math.min(position.character, change.newEnd.character);
			return true;
		}
		else if (change.newEnd.line < position.line) {
			position.line = change.newEnd.line;
			position.character = change.newEnd.character;
			return true;
		}
	}
	else if (change.range.end.line === position.line) {
		const characterDiff = change.newEnd.character - change.range.end.character;
		if (position.character >= change.range.end.character) {
			if (change.newEnd.line !== change.range.end.line) {
				position.line = change.newEnd.line;
				position.character = change.newEnd.character + position.character - change.range.end.character;
			}
			else {
				if (isEnd ? change.range.end.character < position.character : change.range.end.character <= position.character) {
					position.character += characterDiff;
				}
				else {
					const offset = change.range.end.character - position.character;
					if (-characterDiff > offset) {
						position.character += characterDiff + offset;
					}
				}
			}
			return true;
		}
		else {
			if (change.newEnd.line === change.range.end.line) {
				const offset = change.range.end.character - position.character;
				if (-characterDiff > offset) {
					position.character += characterDiff + offset;
				}
			}
			else if (change.newEnd.line < change.range.end.line) {
				position.line = change.newEnd.line;
				position.character = change.newEnd.character;
			}
			else {
				// No change
			}
			return true;
		}
	}
	else if (change.range.end.line < position.line) {
		position.line += change.newEnd.line - change.range.end.line;
		return true;
	}
	return false;
}

export interface ServiceDiagnosticData {
	uri: string;
	version: number;
	original: Pick<vscode.Diagnostic, 'data'>;
	isFormat: boolean;
	pluginIndex: number;
	documentUri: string;
}

interface Cache {
	snapshot?: ts.IScriptSnapshot;
	document?: TextDocument;
	errors: vscode.Diagnostic[];
}

type CacheMap = Map<
	number,
	Map<
		string,
		{
			documentVersion: number,
			errors: vscode.Diagnostic[],
		}
	>
>;

export const errorMarkups = createUriMap<{
	error: vscode.Diagnostic,
	markup: vscode.MarkupContent,
}[]>();

export function register(context: LanguageServiceContext) {

	const lastResponses = createUriMap<
		{
			semantic: Cache,
			syntactic: Cache,
		}
	>();
	const cacheMaps = {
		semantic: new Map() as CacheMap,
		syntactic: new Map() as CacheMap,
	};

	context.env.onDidChangeConfiguration?.(() => {
		lastResponses.clear();
		cacheMaps.semantic.clear();
		cacheMaps.syntactic.clear();
	});

	return async (
		uri: URI,
		token = NoneCancellationToken,
		response?: (result: vscode.Diagnostic[]) => void
	) => {
		const sourceScript = context.language.scripts.get(uri);
		if (!sourceScript) {
			return [];
		}

		const document = context.documents.get(uri, sourceScript.languageId, sourceScript.snapshot);
		const lastResponse = lastResponses.get(uri) ?? lastResponses.set(uri, {
			semantic: { errors: [] },
			syntactic: { errors: [] },
		}).get(uri)!;

		let updateCacheRangeFailed = false;
		let errorsUpdated = false;
		let lastCheckCancelAt = 0;

		for (const cache of Object.values(lastResponse)) {

			const oldSnapshot = cache.snapshot;
			const oldDocument = cache.document;
			const change = oldSnapshot ? sourceScript.snapshot.getChangeRange(oldSnapshot) : undefined;

			cache.snapshot = sourceScript.snapshot;
			cache.document = document;

			if (!updateCacheRangeFailed && oldDocument && change) {
				const changeRange = {
					range: {
						start: oldDocument.positionAt(change.span.start),
						end: oldDocument.positionAt(change.span.start + change.span.length),
					},
					newEnd: document.positionAt(change.span.start + change.newLength),
				};
				for (const error of cache.errors) {
					if (!updateRange(error.range, changeRange)) {
						updateCacheRangeFailed = true;
						break;
					}
				}
			}
		}

		await worker('provideDiagnostics', cacheMaps.syntactic, lastResponse.syntactic);
		await doResponse();
		await worker('provideSemanticDiagnostics', cacheMaps.semantic, lastResponse.semantic);

		return await collectErrors();

		async function doResponse() {
			if (errorsUpdated && !updateCacheRangeFailed) {
				response?.(await collectErrors());
				errorsUpdated = false;
			}
		}

		function collectErrors() {
			return Object.values(lastResponse).flatMap(({ errors }) => errors);
		}

		async function worker(
			api: 'provideDiagnostics' | 'provideSemanticDiagnostics',
			cacheMap: CacheMap,
			cache: Cache
		) {
			const result = await documentFeatureWorker(
				context,
				uri,
				map => map.map.mappings.some(mapping => isDiagnosticsEnabled(mapping.data)),
				async (plugin, document) => {

					if (token) {
						if (Date.now() - lastCheckCancelAt >= 5) {
							await sleep(5); // waiting LSP event polling
							lastCheckCancelAt = Date.now();
						}
						if (token.isCancellationRequested) {
							return;
						}
					}

					const pluginIndex = context.plugins.indexOf(plugin);
					const pluginCache = cacheMap.get(pluginIndex) ?? cacheMap.set(pluginIndex, new Map()).get(pluginIndex)!;
					const cache = pluginCache.get(document.uri);

					if (api !== 'provideSemanticDiagnostics' && cache && cache.documentVersion === document.version) {
						return cache.errors;
					}

					const errors = await plugin[1][api]?.(document, token) || [];

					errors.forEach(error => {
						error.data = {
							uri: uri.toString(),
							version: document.version,
							pluginIndex: pluginIndex,
							isFormat: false,
							original: {
								data: error.data,
							},
							documentUri: document.uri,
						} satisfies ServiceDiagnosticData;
					});

					errorsUpdated = true;

					pluginCache.set(document.uri, {
						documentVersion: document.version,
						errors,
					});

					return errors;
				},
				(errors, map) => {
					return errors
						.map(error => transformDiagnostic(context, error, map, shouldReportDiagnostics))
						.filter(notEmpty);
				},
				arr => dedupe.withDiagnostics(arr.flat())
			);
			if (result) {
				cache.errors = result;
				cache.snapshot = sourceScript?.snapshot;
			}
		}
	};
}

export function transformDiagnostic(
	context: LanguageServiceContext,
	error: vscode.Diagnostic,
	map: SourceMapWithDocuments | undefined,
	filter: (data: CodeInformation) => boolean
) {
	// clone it to avoid modify cache
	let _error: vscode.Diagnostic = { ...error };

	if (map) {
		const range = map.getSourceRange(error.range, filter);
		if (!range) {
			return;
		}
		_error.range = range;
	}

	if (_error.relatedInformation) {

		const relatedInfos: vscode.DiagnosticRelatedInformation[] = [];

		for (const info of _error.relatedInformation) {

			const decoded = context.decodeEmbeddedDocumentUri(URI.parse(info.location.uri));
			const sourceScript = decoded && context.language.scripts.get(decoded[0]);
			const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);

			if (virtualCode) {
				for (const map of context.documents.getMaps(virtualCode)) {
					const range = map.getSourceRange(info.location.range, filter);
					if (range) {
						relatedInfos.push({
							location: {
								uri: map.sourceDocument.uri,
								range,
							},
							message: info.message,
						});
					}
				}
			}
			else {
				relatedInfos.push(info);
			}
		}

		_error.relatedInformation = relatedInfos;
	}

	return _error;
}
