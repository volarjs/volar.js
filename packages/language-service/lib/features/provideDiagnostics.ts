import { isDiagnosticsEnabled, shouldReportDiagnostics, SourceScript, VirtualCode } from '@volar/language-core';
import type * as ts from 'typescript';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { sleep } from '../utils/common';
import * as dedupe from '../utils/dedupe';
import { documentFeatureWorker, DocumentsAndMap, getSourceRange } from '../utils/featureWorkers';
import { createUriMap } from '../utils/uriMap';

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
		response?: (result: vscode.Diagnostic[]) => void,
		token = NoneCancellationToken
	) => {

		let langaugeIdAndSnapshot: SourceScript<URI> | VirtualCode | undefined;

		const decoded = context.decodeEmbeddedDocumentUri(uri);
		if (decoded) {
			langaugeIdAndSnapshot = context.language.scripts.get(decoded[0])?.generated?.embeddedCodes.get(decoded[1]);
		}
		else {
			langaugeIdAndSnapshot = context.language.scripts.get(uri);
		}
		if (!langaugeIdAndSnapshot) {
			return [];
		}

		const document = context.documents.get(uri, langaugeIdAndSnapshot.languageId, langaugeIdAndSnapshot.snapshot);
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
			const change = oldSnapshot ? langaugeIdAndSnapshot.snapshot.getChangeRange(oldSnapshot) : undefined;

			cache.snapshot = langaugeIdAndSnapshot.snapshot;
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

		await worker('syntactic', cacheMaps.syntactic, lastResponse.syntactic);
		processResponse();
		await worker('semantic', cacheMaps.semantic, lastResponse.semantic);

		return collectErrors();

		function processResponse() {
			if (errorsUpdated && !updateCacheRangeFailed) {
				response?.(collectErrors());
				errorsUpdated = false;
			}
		}

		function collectErrors() {
			return Object.values(lastResponse).flatMap(({ errors }) => errors);
		}

		async function worker(
			kind: 'syntactic' | 'semantic',
			cacheMap: CacheMap,
			cache: Cache
		) {
			const result = await documentFeatureWorker(
				context,
				uri,
				docs => docs[2].mappings.some(mapping => isDiagnosticsEnabled(mapping.data)),
				async (plugin, document) => {
					const interFileDependencies = plugin[0].capabilities.diagnosticProvider?.interFileDependencies;
					if (kind === 'semantic' !== interFileDependencies) {
						return;
					}

					if (Date.now() - lastCheckCancelAt >= 10) {
						await sleep(10); // waiting LSP event polling
						lastCheckCancelAt = Date.now();
					}
					if (token.isCancellationRequested) {
						return;
					}

					const pluginIndex = context.plugins.indexOf(plugin);
					const pluginCache = cacheMap.get(pluginIndex) ?? cacheMap.set(pluginIndex, new Map()).get(pluginIndex)!;
					const cache = pluginCache.get(document.uri);

					if (!interFileDependencies && cache && cache.documentVersion === document.version) {
						return cache.errors;
					}

					const errors = await plugin[1].provideDiagnostics?.(document, token) || [];

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
						.map(error => transformDiagnostic(context, error, map))
						.filter(error => !!error);
				},
				arr => dedupe.withDiagnostics(arr.flat())
			);
			if (result) {
				cache.errors = result;
				cache.snapshot = langaugeIdAndSnapshot?.snapshot;
			}
		}
	};
}

export function transformDiagnostic(
	context: LanguageServiceContext,
	error: vscode.Diagnostic,
	docs: DocumentsAndMap | undefined
) {
	// clone it to avoid modify cache
	let _error: vscode.Diagnostic = { ...error };

	if (docs) {
		const range = getSourceRange(docs, error.range, data => shouldReportDiagnostics(data, error.source, error.code));
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

			if (sourceScript && virtualCode) {
				const embeddedDocument = context.documents.get(
					context.encodeEmbeddedDocumentUri(sourceScript.id, virtualCode.id),
					virtualCode.languageId,
					virtualCode.snapshot
				);
				for (const [sourceScript, map] of context.language.maps.forEach(virtualCode)) {
					const sourceDocument = context.documents.get(sourceScript.id, sourceScript.languageId, sourceScript.snapshot);
					const docs: DocumentsAndMap = [sourceDocument, embeddedDocument, map];
					const range = getSourceRange(docs, info.location.range, data => shouldReportDiagnostics(data, undefined, undefined));
					if (range) {
						relatedInfos.push({
							location: {
								uri: sourceDocument.uri,
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
