import type { TextDocument } from 'vscode-languageserver-textdocument';
import { visitEmbedded } from './definePlugin';
import type { LanguageServicePluginInstance, LanguageServiceRuntimeContext, Rule, RuleContext } from '../types';
import { FileRangeCapabilities, VirtualFile } from '@volar/language-service';
import { SourceMapWithDocuments } from '../documents';
import * as shared from '@volar/shared';

export async function documentFeatureWorker<T>(
	context: LanguageServiceRuntimeContext,
	uri: string,
	isValidSourceMap: (file: VirtualFile, sourceMap: SourceMapWithDocuments<FileRangeCapabilities>) => boolean,
	worker: (plugin: LanguageServicePluginInstance, document: TextDocument) => T,
	transform: (result: NonNullable<Awaited<T>>, sourceMap: SourceMapWithDocuments<FileRangeCapabilities> | undefined) => Awaited<T> | undefined,
	combineResult?: (results: NonNullable<Awaited<T>>[]) => NonNullable<Awaited<T>>,
) {
	return languageFeatureWorker(
		context,
		uri,
		undefined,
		(_, map, file) => {
			if (isValidSourceMap(file, map)) {
				return [undefined];
			}
			return [];
		},
		worker,
		transform,
		combineResult,
	);
}

export async function languageFeatureWorker<T, K>(
	context: LanguageServiceRuntimeContext,
	uri: string,
	arg: K,
	transformArg: (arg: K, sourceMap: SourceMapWithDocuments<FileRangeCapabilities>, file: VirtualFile) => Generator<K> | K[],
	worker: (plugin: LanguageServicePluginInstance, document: TextDocument, arg: K, sourceMap: SourceMapWithDocuments<FileRangeCapabilities> | undefined, file: VirtualFile | undefined) => T,
	transform: (result: NonNullable<Awaited<T>>, sourceMap: SourceMapWithDocuments<FileRangeCapabilities> | undefined) => Awaited<T> | undefined,
	combineResult?: (results: NonNullable<Awaited<T>>[]) => NonNullable<Awaited<T>>,
	reportProgress?: (result: NonNullable<Awaited<T>>) => void,
) {

	const document = context.getTextDocument(uri);
	const virtualFile = context.documents.getSourceByUri(uri)?.root;

	let results: NonNullable<Awaited<T>>[] = [];

	if (virtualFile) {

		await visitEmbedded(context.documents, virtualFile, async (file, map) => {

			for (const mappedArg of transformArg(arg, map, file)) {

				for (const plugin of Object.values(context.plugins)) {

					const embeddedResult = await worker(plugin, map.virtualFileDocument, mappedArg, map, file);

					if (!embeddedResult)
						continue;

					const result = transform(embeddedResult!, map);

					if (!result)
						continue;

					results.push(result!);

					if (!combineResult)
						return false;

					const isEmptyArray = Array.isArray(result) && result.length === 0;

					if (reportProgress && !isEmptyArray) {
						reportProgress(combineResult(results));
					}
				}
			}

			return true;
		});
	}
	else if (document) {

		for (const plugin of Object.values(context.plugins)) {

			const embeddedResult = await worker(plugin, document, arg, undefined, undefined);
			if (!embeddedResult)
				continue;

			const result = transform(embeddedResult, undefined);
			if (!result)
				continue;

			results.push(result);

			if (!combineResult)
				break;

			const isEmptyArray = Array.isArray(result) && result.length === 0;

			if (reportProgress && !isEmptyArray) {
				reportProgress(combineResult(results));
			}
		}
	}

	if (combineResult && results.length > 0) {
		return combineResult(results);
	}
	else if (results.length > 0) {
		return results[0];
	}
}

export async function ruleWorker<T>(
	context: LanguageServiceRuntimeContext,
	uri: string,
	isValidSourceMap: (file: VirtualFile) => boolean,
	worker: (ruleName: string, rule: Rule, ruleCtx: RuleContext) => T,
	transform: (result: NonNullable<Awaited<T>>, sourceMap: SourceMapWithDocuments<FileRangeCapabilities> | undefined) => Awaited<T> | undefined,
	combineResult?: (results: NonNullable<Awaited<T>>[]) => NonNullable<Awaited<T>>,
	reportProgress?: (result: NonNullable<Awaited<T>>) => void,
) {

	const document = context.getTextDocument(uri);
	const virtualFile = context.documents.getSourceByUri(uri)?.root;

	let results: NonNullable<Awaited<T>>[] = [];

	if (virtualFile) {

		await visitEmbedded(context.documents, virtualFile, async (file, map) => {

			if (!isValidSourceMap(file)) {
				return true;
			}

			let ruleCtx: RuleContext = {
				ruleId: '',
				document: map.virtualFileDocument,
				uriToFileName: shared.uriToFileName,
				fileNameToUri: shared.fileNameToUri,
				report: () => { },
			};

			for (const plugin of Object.values(context.plugins)) {
				if (plugin.validation?.setupRuleContext) {
					ruleCtx = await plugin.validation.setupRuleContext(ruleCtx);
				}
			}

			for (const ruleName in context.rules) {

				const rule = context.rules[ruleName];
				if (!rule) {
					continue;
				}

				ruleCtx.ruleId = ruleName;
				const embeddedResult = await worker(ruleName, rule, ruleCtx);

				if (!embeddedResult)
					continue;

				const result = transform(embeddedResult!, map);

				if (!result)
					continue;

				results.push(result!);

				if (!combineResult)
					return false;

				const isEmptyArray = Array.isArray(result) && result.length === 0;

				if (reportProgress && !isEmptyArray) {
					reportProgress(combineResult(results));
				}
			}

			return true;
		});
	}
	else if (document) {

		let ruleCtx: RuleContext = {
			ruleId: '',
			document,
			uriToFileName: shared.uriToFileName,
			fileNameToUri: shared.fileNameToUri,
			report: () => { },
		};

		for (const plugin of Object.values(context.plugins)) {
			if (plugin.validation?.setupRuleContext) {
				ruleCtx = await plugin.validation?.setupRuleContext(ruleCtx);
			}
		}

		for (const ruleName in context.rules) {

			const rule = context.rules[ruleName];
			if (!rule) {
				continue;
			}

			ruleCtx.ruleId = ruleName;
			const embeddedResult = await worker(ruleName, rule, ruleCtx);
			if (!embeddedResult)
				continue;

			const result = transform(embeddedResult, undefined);
			if (!result)
				continue;

			results.push(result);

			if (!combineResult)
				break;

			const isEmptyArray = Array.isArray(result) && result.length === 0;

			if (reportProgress && !isEmptyArray) {
				reportProgress(combineResult(results));
			}
		}
	}

	if (combineResult && results.length > 0) {
		return combineResult(results);
	}
	else if (results.length > 0) {
		return results[0];
	}
}
