import { isDiagnosticsEnabled, type CodeInformation, shouldReportDiagnostics } from '@volar/language-core';
import type * as ts from 'typescript';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SourceMapWithDocuments } from '../documents';
import type { ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { sleep } from '../utils/common';
import * as dedupe from '../utils/dedupe';
import { documentFeatureWorker } from '../utils/featureWorkers';

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

export interface ServiceDiagnosticData {
	uri: string;
	version: number;
	original: Pick<vscode.Diagnostic, 'data'>;
	isFormat: boolean;
	serviceIndex: number;
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
			errors: vscode.Diagnostic[] | undefined | null,
		}
	>
>;

export const errorMarkups: Record<string, {
	error: vscode.Diagnostic,
	markup: vscode.MarkupContent,
}[]> = {};

export function register(context: ServiceContext) {

	const lastResponses = new Map<
		string,
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
		uri: string,
		token = NoneCancellationToken,
		response?: (result: vscode.Diagnostic[]) => void,
	) => {

		const sourceFile = context.language.files.getSourceFile(context.env.uriToFileName(uri));
		if (!sourceFile) {
			return [];
		}

		const document = context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);
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
			const change = oldSnapshot ? sourceFile.snapshot.getChangeRange(oldSnapshot) : undefined;

			cache.snapshot = sourceFile.snapshot;
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

		async function collectErrors() {
			const errors = Object.values(lastResponse).flatMap(({ errors }) => errors);
			errorMarkups[uri] = [];
			for (const error of errors) {
				for (const service of context.services) {
					if (context.disabledServicePlugins.has(service[1])) {
						continue;
					}
					const markup = await service[1].provideDiagnosticMarkupContent?.(error, token);
					if (markup) {
						errorMarkups[uri].push({ error, markup });
					}
				}
			}
			return errors;
		}

		async function worker(
			api: 'provideDiagnostics' | 'provideSemanticDiagnostics',
			cacheMap: CacheMap,
			cache: Cache,
		) {
			const result = await documentFeatureWorker(
				context,
				uri,
				map => map.map.mappings.some(mapping => isDiagnosticsEnabled(mapping.data)),
				async (service, document) => {

					if (token) {
						if (Date.now() - lastCheckCancelAt >= 5) {
							await sleep(5); // waiting LSP event polling
							lastCheckCancelAt = Date.now();
						}
						if (token.isCancellationRequested) {
							return;
						}
					}

					const serviceIndex = context.services.indexOf(service);
					const serviceCache = cacheMap.get(serviceIndex) ?? cacheMap.set(serviceIndex, new Map()).get(serviceIndex)!;
					const cache = serviceCache.get(document.uri);

					if (api !== 'provideSemanticDiagnostics' && cache && cache.documentVersion === document.version) {
						return cache.errors;
					}

					const errors = await service[1][api]?.(document, token);

					errors?.forEach(error => {
						error.data = {
							uri,
							version: document!.version,
							serviceIndex,
							isFormat: false,
							original: {
								data: error.data,
							},
							documentUri: document.uri,
						} satisfies ServiceDiagnosticData;
					});

					errorsUpdated = true;

					serviceCache.set(document.uri, {
						documentVersion: document.version,
						errors,
					});

					return errors;
				},
				(errors, map) => {
					return transformErrorRangeBase(errors, map, shouldReportDiagnostics);
				},
				arr => dedupe.withDiagnostics(arr.flat()),
			);
			if (result) {
				cache.errors = result;
				cache.snapshot = sourceFile?.snapshot;
			}
		}
	};

	function transformErrorRangeBase(errors: vscode.Diagnostic[], map: SourceMapWithDocuments<CodeInformation> | undefined, filter: (data: CodeInformation) => boolean) {

		const result: vscode.Diagnostic[] = [];

		for (const error of errors) {

			// clone it to avoid modify cache
			let _error: vscode.Diagnostic = { ...error };

			if (map) {
				const range = map.getSourceRange(error.range, filter);
				if (!range) {
					continue;
				}
				_error.range = range;
			}

			if (_error.relatedInformation) {

				const relatedInfos: vscode.DiagnosticRelatedInformation[] = [];

				for (const info of _error.relatedInformation) {

					const [virtualFile] = context.language.files.getVirtualFile(context.env.uriToFileName(info.location.uri));

					if (virtualFile) {
						for (const map of context.documents.getMaps(virtualFile)) {
							const range = map.getSourceRange(info.location.range, filter);
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
