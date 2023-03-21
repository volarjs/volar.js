import { FileRangeCapabilities } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SourceMapWithDocuments } from '../documents';
import type { LanguageServicePluginContext, RuleContext } from '../types';
import { sleep } from '../utils/common';
import * as dedupe from '../utils/dedupe';
import { languageFeatureWorker, ruleWorker } from '../utils/featureWorkers';

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

export interface PluginDiagnosticData {
	uri: string,
	version: number,
	original: Pick<vscode.Diagnostic, 'data'>,
	type: 'plugin' | 'rule',
	isFormat: boolean,
	pluginOrRuleId: string,
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
			tsProjectVersion: string | undefined,
			errors: vscode.Diagnostic[] | undefined | null,
		}
	>
>;

export function register(context: LanguageServicePluginContext) {

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
		token = vscode.CancellationToken.None,
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
		const newSnapshot = context.host.getScriptSnapshot(context.uriToFileName(uri));

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
			await lintWorker('onFormat', cacheMaps.format_rules, lastResponse.format_rules);
			doResponse();
			await lintWorker('onSyntax', cacheMaps.syntax_rules, lastResponse.syntax_rules);
			doResponse();
			await worker('provideSyntacticDiagnostics', cacheMaps.syntactic, lastResponse.syntactic);
			doResponse();
		}

		if (mode === 'all' || mode === 'semantic') {
			await lintWorker('onSemantic', cacheMaps.semantic_rules, lastResponse.semantic_rules);
			doResponse();
			await worker('provideSemanticDiagnostics', cacheMaps.semantic, lastResponse.semantic);
		}

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

		async function lintWorker(
			api: 'onSyntax' | 'onSemantic' | 'onFormat',
			cacheMap: CacheMap,
			cache: Cache,
		) {
			const result = await ruleWorker(
				context,
				api,
				uri,
				file => api === 'onFormat' ? !!file.capabilities.documentFormatting : !!file.capabilities.diagnostic,
				async (ruleName, rule, ruleCtx) => {

					if (token) {
						if (Date.now() - lastCheckCancelAt >= 5) {
							await sleep(5); // wait for LSP event polling
							lastCheckCancelAt = Date.now();
						}
						if (token.isCancellationRequested) {
							return;
						}
					}

					const pluginCache = cacheMap.get(ruleName) ?? cacheMap.set(ruleName, new Map()).get(ruleName)!;
					const cache = pluginCache.get(ruleCtx.document.uri);
					const tsProjectVersion = (api === 'onSemantic') ? context.core.typescript.languageServiceHost.getProjectVersion?.() : undefined;

					if (api === 'onSemantic') {
						if (cache && cache.documentVersion === ruleCtx.document.version && cache.tsProjectVersion === tsProjectVersion) {
							return cache.errors;
						}
					}
					else {
						if (cache && cache.documentVersion === ruleCtx.document.version) {
							return cache.errors;
						}
					}

					const reportResults: Parameters<RuleContext['report']>[] = [];

					ruleCtx.report = (error, ...fixes) => {

						if (!vscode.Diagnostic.is(error)) {
							console.warn('[volar/rules-api] report() error must be a Diagnostic.');
							return;
						}

						error.message ||= 'No message.';
						error.source ||= 'rules';
						error.code ||= ruleCtx.ruleId;

						const severity = context.config.lint?.severities?.[ruleCtx.ruleId];
						if (severity !== undefined) {
							error.severity = severity;
						}

						reportResults.push([error, ...fixes]);
					};

					try {
						await rule[api]?.(ruleCtx);
					}
					catch (err) {
						console.warn(`[volar/rules-api] ${ruleName} ${api} error.`);
						console.warn(err);
					}

					context.ruleFixes ??= {};
					context.ruleFixes[ruleCtx.document.uri] ??= {};
					context.ruleFixes[ruleCtx.document.uri][ruleCtx.ruleId] ??= {};

					reportResults?.forEach(([error, ...fixes], index) => {
						context.ruleFixes![ruleCtx.document.uri][ruleCtx.ruleId][index] = [error, fixes];
						error.data = {
							uri,
							version: newDocument!.version,
							type: 'rule',
							isFormat: api === 'onFormat',
							pluginOrRuleId: ruleCtx.ruleId,
							original: {
								data: error.data,
							},
							ruleFixIndex: index,
							documentUri: ruleCtx.document.uri,
						}satisfies PluginDiagnosticData;
					});

					errorsUpdated = true;

					const errors = reportResults.map(reportResult => reportResult[0]);

					pluginCache.set(ruleCtx.document.uri, {
						documentVersion: ruleCtx.document.version,
						errors,
						tsProjectVersion,
					});

					return errors;
				},
				api === 'onFormat' ? transformFormatErrorRange : transformErrorRange,
				arr => arr.flat(),
			);
			if (result) {
				cache.errors = result;
				cache.snapshot = newSnapshot;
			}
		}

		async function worker(
			api: 'provideSyntacticDiagnostics' | 'provideSemanticDiagnostics',
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
							await sleep(5); // waiting LSP event polling
							lastCheckCancelAt = Date.now();
						}
						if (token.isCancellationRequested) {
							return;
						}
					}

					const pluginId = Object.keys(context.plugins).find(key => context.plugins[key] === plugin)!;
					const pluginCache = cacheMap.get(pluginId) ?? cacheMap.set(pluginId, new Map()).get(pluginId)!;
					const cache = pluginCache.get(document.uri);
					const tsProjectVersion = api === 'provideSemanticDiagnostics' ? context.core.typescript.languageServiceHost.getProjectVersion?.() : undefined;

					if (api === 'provideSemanticDiagnostics') {
						if (cache && cache.documentVersion === document.version && cache.tsProjectVersion === tsProjectVersion) {
							return cache.errors;
						}
					}
					else {
						if (cache && cache.documentVersion === document.version) {
							return cache.errors;
						}
					}

					const errors = await plugin[api]?.(document, token);

					errors?.forEach(error => {
						error.data = {
							uri,
							version: newDocument!.version,
							type: 'plugin',
							pluginOrRuleId: pluginId,
							isFormat: false,
							original: {
								data: error.data,
							},
							ruleFixIndex: 0,
							documentUri: document.uri,
						}satisfies PluginDiagnosticData;
					});

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

	function transformFormatErrorRange(errors: vscode.Diagnostic[], map: SourceMapWithDocuments<FileRangeCapabilities> | undefined) {
		return transformErrorRangeBase(errors, map, () => true);
	}

	function transformErrorRange(errors: vscode.Diagnostic[], map: SourceMapWithDocuments<FileRangeCapabilities> | undefined) {
		return transformErrorRangeBase(errors, map, data => !!data.diagnostic);
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
