import { FileRangeCapabilities } from '@volar/language-core';
import * as shared from '@volar/shared';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SourceMapWithDocuments } from '../documents';
import type { LanguageServiceRuntimeContext } from '../types';
import * as dedupe from '../utils/dedupe';
import { languageFeatureWorker } from '../utils/featureWorkers';

export function updateRange(
	range: vscode.Range,
	change: {
		range: vscode.Range,
		newEnd: vscode.Position;
	},
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
	isEnd: boolean,
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
			tsProjectVersion: string | undefined,
			errors: vscode.Diagnostic[] | undefined | null,
		}
	>
>;

export function register(context: LanguageServiceRuntimeContext) {

	const lastResponses = new Map<
		string,
		{
			semantic: Cache,
			declaration: Cache,
			syntactic: Cache,
			suggestion: Cache,
		}
	>();
	const cacheMaps = {
		semantic: new Map() as CacheMap,
		declaration: new Map() as CacheMap,
		syntactic: new Map() as CacheMap,
		suggestion: new Map() as CacheMap,
	};

	return async (uri: string, token?: vscode.CancellationToken, response?: (result: vscode.Diagnostic[]) => void) => {

		const lastResponse = lastResponses.get(uri) ?? lastResponses.set(uri, {
			semantic: { errors: [] },
			declaration: { errors: [] },
			suggestion: { errors: [] },
			syntactic: { errors: [] },
		}).get(uri)!;
		const newSnapshot = context.host.getScriptSnapshot(shared.uriToFileName(uri));
		const newDocument = context.getTextDocument(uri);

		let updateCacheRangeFailed = false;
		let errorsUpdated = false;
		let lastCheckCancelAt = 0;

		for (const cache of Object.values(lastResponse)) {

			const oldSnapshot = cache.snapshot;
			const oldDocument = cache.document;
			const change = oldSnapshot ? newSnapshot?.getChangeRange(oldSnapshot) : undefined;

			cache.snapshot = newSnapshot;
			cache.document = newDocument;

			if (!updateCacheRangeFailed && newDocument && oldSnapshot && oldDocument && newSnapshot && change) {
				const changeRange = {
					range: {
						start: oldDocument.positionAt(change.span.start),
						end: oldDocument.positionAt(change.span.start + change.span.length),
					},
					newEnd: newDocument.positionAt(change.span.start + change.newLength),
				};
				for (const error of cache.errors) {
					if (!updateRange(error.range, changeRange)) {
						updateCacheRangeFailed = true;
						break;
					}
				}
			}
		}

		await worker('onSyntactic', cacheMaps.syntactic, lastResponse.syntactic);
		doResponse();
		await worker('onSuggestion', cacheMaps.suggestion, lastResponse.suggestion);
		doResponse();
		await worker('onSemantic', cacheMaps.semantic, lastResponse.semantic);
		doResponse();
		await worker('onDeclaration', cacheMaps.declaration, lastResponse.declaration);

		return collectErrors();

		function doResponse() {
			if (errorsUpdated && !updateCacheRangeFailed) {
				response?.(collectErrors());
				errorsUpdated = false;
			}
		}

		function collectErrors() {
			return Object.values(lastResponse).flatMap(({ errors }) => errors);
		}

		async function worker(
			api: 'onSemantic' | 'onSyntactic' | 'onSuggestion' | 'onDeclaration',
			cacheMap: CacheMap,
			cache: Cache,
		) {
			const result = await languageFeatureWorker(
				context,
				uri,
				true,
				function* (arg, _, file) {
					if (file.capabilities.diagnostic) {
						yield arg;
					}
				},
				async (plugin, document) => {

					if (token) {

						if (Date.now() - lastCheckCancelAt >= 5) {
							await shared.sleep(5); // wait for LSP event polling
							lastCheckCancelAt = Date.now();
						}

						if (token.isCancellationRequested)
							return;
					}

					const pluginId = context.plugins.indexOf(plugin);
					const pluginCache = cacheMap.get(pluginId) ?? cacheMap.set(pluginId, new Map()).get(pluginId)!;
					const cache = pluginCache.get(document.uri);
					const tsProjectVersion = (api === 'onDeclaration' || api === 'onSemantic') ? context.core.typescript.languageServiceHost.getProjectVersion?.() : undefined;

					if (api === 'onDeclaration' || api === 'onSemantic') {
						if (cache && cache.documentVersion === document.version && cache.tsProjectVersion === tsProjectVersion) {
							return cache.errors;
						}
					}
					else {
						if (cache && cache.documentVersion === document.version) {
							return cache.errors;
						}
					}

					const errors = await plugin.validation?.[api]?.(document);

					errorsUpdated = true;

					pluginCache.set(document.uri, {
						documentVersion: document.version,
						errors,
						tsProjectVersion,
					});

					return errors;
				},
				transformErrorRange,
				arr => dedupe.withDiagnostics(arr.flat()),
			);

			if (result) {
				cache.errors = result;
				cache.snapshot = newSnapshot;
			}
		}
	};

	function transformErrorRange(errors: vscode.Diagnostic[], map: SourceMapWithDocuments<FileRangeCapabilities> | undefined) {

		const result: vscode.Diagnostic[] = [];

		for (const error of errors) {

			// clone it to avoid modify cache
			let _error: vscode.Diagnostic = { ...error };

			if (map) {
				const range = map.toSourceRange(error.range, data => !!data.diagnostic);
				if (!range) {
					continue;
				}
				_error.range = range;
			}

			if (_error.relatedInformation) {

				const relatedInfos: vscode.DiagnosticRelatedInformation[] = [];

				for (const info of _error.relatedInformation) {
					if (context.documents.hasVirtualFileByUri(info.location.uri)) {
						for (const [_, map] of context.documents.getMapsByVirtualFileUri(info.location.uri)) {
							const range = map.toSourceRange(info.location.range, data => !!data.diagnostic);
							if (range) {
								relatedInfos.push({
									location: {
										uri: map.sourceFileDocument.uri,
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

			result.push(_error);
		}

		return result;
	}
}
