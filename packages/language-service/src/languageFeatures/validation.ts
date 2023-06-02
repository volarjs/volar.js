import { FileRangeCapabilities } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import type * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SourceMapWithDocuments } from '../documents';
import { ServiceContext, RuleContext, RuleType } from '../types';
import { sleep } from '../utils/common';
import * as dedupe from '../utils/dedupe';
import { languageFeatureWorker, ruleWorker } from '../utils/featureWorkers';
import { NoneCancellationToken } from '../utils/cancellation';

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
	uri: string,
	version: number,
	original: Pick<vscode.Diagnostic, 'data'>,
	type: 'service' | 'rule',
	isFormat: boolean,
	serviceOrRuleId: string,
	ruleFixIndex: number,
	documentUri: string,
}

interface Cache {
	snapshot?: ts.IScriptSnapshot;
	document?: TextDocument;
	errors: vscode.Diagnostic[];
}

type CacheMap = Map<
	number | string,
	Map<
		string,
		{
			documentVersion: number,
			projectVersion: number | string | undefined,
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
			semantic_rules: Cache,
			syntax_rules: Cache,
			format_rules: Cache,
		}
	>();
	const cacheMaps = {
		semantic: new Map() as CacheMap,
		syntactic: new Map() as CacheMap,
		semantic_rules: new Map() as CacheMap,
		syntax_rules: new Map() as CacheMap,
		format_rules: new Map() as CacheMap,
	};

	return async (
		uri: string,
		mode: 'all' | 'semantic' | 'syntactic',
		token = NoneCancellationToken,
		response?: (result: vscode.Diagnostic[]) => void,
	) => {

		const newDocument = context.getTextDocument(uri);
		if (!newDocument) {
			return [];
		}

		const lastResponse = lastResponses.get(uri) ?? lastResponses.set(uri, {
			semantic: { errors: [] },
			syntactic: { errors: [] },
			semantic_rules: { errors: [] },
			syntax_rules: { errors: [] },
			format_rules: { errors: [] },
		}).get(uri)!;
		const newSnapshot = context.host.getScriptSnapshot(context.env.uriToFileName(uri));

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

		if (mode === 'all' || mode === 'syntactic') {
			await lintWorker(RuleType.Format, cacheMaps.format_rules, lastResponse.format_rules);
			await doResponse();
			await lintWorker(RuleType.Syntax, cacheMaps.syntax_rules, lastResponse.syntax_rules);
			await doResponse();
			await worker('provideDiagnostics', cacheMaps.syntactic, lastResponse.syntactic);
			await doResponse();
		}

		if (mode === 'all' || mode === 'semantic') {
			await lintWorker(RuleType.Semantic, cacheMaps.semantic_rules, lastResponse.semantic_rules);
			await doResponse();
			await worker('provideSemanticDiagnostics', cacheMaps.semantic, lastResponse.semantic);
		}

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
				for (const service of Object.values(context.services)) {
					const markup = await service.provideDiagnosticMarkupContent?.(error, token);
					if (markup) {
						errorMarkups[uri].push({ error, markup });
					}
				}
			}
			return errors;
		}

		async function lintWorker(
			ruleType: RuleType,
			cacheMap: CacheMap,
			cache: Cache,
		) {
			const result = await ruleWorker(
				context,
				ruleType,
				uri,
				file => ruleType === RuleType.Format ? !!file.capabilities.documentFormatting : !!file.capabilities.diagnostic,
				async (ruleId, rule, lintDocument, ruleCtx) => {

					if (token) {
						if (Date.now() - lastCheckCancelAt >= 5) {
							await sleep(5); // wait for LSP event polling
							lastCheckCancelAt = Date.now();
						}
						if (token.isCancellationRequested) {
							return;
						}
					}

					const pluginCache = cacheMap.get(ruleId) ?? cacheMap.set(ruleId, new Map()).get(ruleId)!;
					const cache = pluginCache.get(lintDocument.uri);
					const projectVersion = (ruleType === RuleType.Semantic) ? context.host.getProjectVersion?.() : undefined;

					if (ruleType === RuleType.Semantic) {
						if (cache && cache.documentVersion === lintDocument.version && cache.projectVersion === projectVersion) {
							return cache.errors;
						}
					}
					else {
						if (cache && cache.documentVersion === lintDocument.version) {
							return cache.errors;
						}
					}

					const reportResults: Parameters<RuleContext['report']>[] = [];

					ruleCtx.report = (error, ...fixes) => {

						error.message ||= 'No message.';
						error.source ||= 'rule';
						error.code ||= ruleId;

						reportResults.push([error, ...fixes]);
					};

					try {
						await rule.run(lintDocument, ruleCtx);
					}
					catch (err) {
						console.warn(`[volar/rules-api] ${ruleId} ${ruleType} error.`);
						console.warn(err);
					}

					context.ruleFixes ??= {};
					context.ruleFixes[lintDocument.uri] ??= {};
					context.ruleFixes[lintDocument.uri][ruleId] ??= {};

					reportResults?.forEach(([error, ...fixes], index) => {
						context.ruleFixes![lintDocument.uri][ruleId][index] = [error, fixes];
						error.data = {
							uri,
							version: newDocument!.version,
							type: 'rule',
							isFormat: ruleType === RuleType.Format,
							serviceOrRuleId: ruleId,
							original: {
								data: error.data,
							},
							ruleFixIndex: index,
							documentUri: lintDocument.uri,
						} satisfies ServiceDiagnosticData;
					});

					errorsUpdated = true;

					const errors = reportResults.map(reportResult => reportResult[0]);

					pluginCache.set(lintDocument.uri, {
						documentVersion: lintDocument.version,
						errors,
						projectVersion,
					});

					return errors;
				},
				ruleType === RuleType.Format ? transformFormatErrorRange : transformErrorRange,
				arr => arr.flat(),
			);
			if (result) {
				cache.errors = result;
				cache.snapshot = newSnapshot;
			}
		}

		async function worker(
			api: 'provideDiagnostics' | 'provideSemanticDiagnostics',
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

					const serviceId = Object.keys(context.services).find(key => context.services[key] === service)!;
					const serviceCache = cacheMap.get(serviceId) ?? cacheMap.set(serviceId, new Map()).get(serviceId)!;
					const cache = serviceCache.get(document.uri);
					const projectVersion = api === 'provideSemanticDiagnostics' ? context.host.getProjectVersion?.() : undefined;

					if (api === 'provideSemanticDiagnostics') {
						if (cache && cache.documentVersion === document.version && cache.projectVersion === projectVersion) {
							return cache.errors;
						}
					}
					else {
						if (cache && cache.documentVersion === document.version) {
							return cache.errors;
						}
					}

					const errors = await service[api]?.(document, token);

					errors?.forEach(error => {
						error.data = {
							uri,
							version: newDocument!.version,
							type: 'service',
							serviceOrRuleId: serviceId,
							isFormat: false,
							original: {
								data: error.data,
							},
							ruleFixIndex: 0,
							documentUri: document.uri,
						} satisfies ServiceDiagnosticData;
					});

					errorsUpdated = true;

					serviceCache.set(document.uri, {
						documentVersion: document.version,
						errors,
						projectVersion,
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

	function transformFormatErrorRange(errors: vscode.Diagnostic[], map: SourceMapWithDocuments<FileRangeCapabilities> | undefined) {
		return transformErrorRangeBase(errors, map, () => true);
	}

	function transformErrorRange(errors: vscode.Diagnostic[], map: SourceMapWithDocuments<FileRangeCapabilities> | undefined) {
		return transformErrorRangeBase(errors, map, data => typeof data.diagnostic === 'object' ? data.diagnostic.shouldReport() : !!data.diagnostic);
	}

	function transformErrorRangeBase(errors: vscode.Diagnostic[], map: SourceMapWithDocuments<FileRangeCapabilities> | undefined, filter: (data: FileRangeCapabilities) => boolean) {

		const result: vscode.Diagnostic[] = [];

		for (const error of errors) {

			// clone it to avoid modify cache
			let _error: vscode.Diagnostic = { ...error };

			if (map) {
				const range = map.toSourceRange(error.range, filter);
				if (!range) {
					continue;
				}
				_error.range = range;
			}

			if (_error.relatedInformation) {

				const relatedInfos: vscode.DiagnosticRelatedInformation[] = [];

				for (const info of _error.relatedInformation) {
					if (context.documents.isVirtualFileUri(info.location.uri)) {
						for (const [_, map] of context.documents.getMapsByVirtualFileUri(info.location.uri)) {
							const range = map.toSourceRange(info.location.range, filter);
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
