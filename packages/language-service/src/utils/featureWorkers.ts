import type { TextDocument } from 'vscode-languageserver-textdocument';
import { visitEmbedded } from './definePlugin';
import type { LanguageServicePluginInstance, LanguageServicePluginContext, Rule, RuleContext } from '../types';
import { FileRangeCapabilities, VirtualFile } from '@volar/language-service';
import { SourceMapWithDocuments } from '../documents';

export async function documentFeatureWorker<T>(
	context: LanguageServicePluginContext,
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
	context: LanguageServicePluginContext,
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

				for (const [pluginId, plugin] of Object.entries(context.plugins)) {

					const embeddedResult = await safeCall(
						() => worker(plugin, map.virtualFileDocument, mappedArg, map, file),
						'plugin ' + pluginId + ' crashed on ' + map.virtualFileDocument.uri,
					);
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

		for (const [pluginId, plugin] of Object.entries(context.plugins)) {

			const embeddedResult = await safeCall(
				() => worker(plugin, document, arg, undefined, undefined),
				'plugin ' + pluginId + ' crashed on ' + uri,
			);
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
	context: LanguageServicePluginContext,
	api: 'onSyntax' | 'onSemantic' | 'onFormat',
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
				// project context
				modules: { typescript: context.typescript?.module },
				uriToFileName: context.uriToFileName,
				fileNameToUri: context.fileNameToUri,
				rootUri: context.rootUri,
				locale: context.locale,
				getConfiguration: context.configurationHost?.getConfiguration,
				onDidChangeConfiguration: context.configurationHost?.onDidChangeConfiguration,
				settings: context.config.lint?.settings ?? {},
				// document context
				ruleId: '',
				document: map.virtualFileDocument,
				report: () => { },
			};

			for (const plugin of Object.values(context.plugins)) {
				try {
					if (plugin.resolveRuleContext) {
						ruleCtx = await plugin.resolveRuleContext(
							ruleCtx,
							api === 'onFormat' ? 'format' : api === 'onSyntax' ? 'syntax' : 'semantic',
						);
					}
				}
				catch (err) {
					console.warn('plugin rule context setup crashed on ' + map.virtualFileDocument.uri + ': ' + err);
				}
			}

			for (const ruleName in context.config.lint?.rules) {

				const rule = context.config.lint?.rules[ruleName];
				if (!rule) {
					continue;
				}

				ruleCtx.ruleId = ruleName;
				const embeddedResult = await safeCall(
					() => worker(ruleName, rule, ruleCtx),
					'rule ' + ruleName + ' crashed on ' + map.virtualFileDocument.uri,
				);
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
			// project context
			modules: { typescript: context.typescript?.module },
			uriToFileName: context.uriToFileName,
			fileNameToUri: context.fileNameToUri,
			rootUri: context.rootUri,
			locale: context.locale,
			getConfiguration: context.configurationHost?.getConfiguration,
			onDidChangeConfiguration: context.configurationHost?.onDidChangeConfiguration,
			settings: context.config.lint?.settings ?? {},
			// document context
			ruleId: '',
			document,
			report: () => { },
		};

		for (const plugin of Object.values(context.plugins)) {
			try {
				if (plugin.resolveRuleContext) {
					ruleCtx = await plugin.resolveRuleContext(
						ruleCtx,
						api === 'onFormat' ? 'format' : api === 'onSyntax' ? 'syntax' : 'semantic',
					);
				}
			}
			catch (err) {
				console.warn('plugin rule context setup crashed on ' + document.uri + ': ' + err);
			}
		}

		for (const ruleName in context.config.lint?.rules) {

			const rule = context.config.lint?.rules[ruleName];
			if (!rule) {
				continue;
			}

			ruleCtx.ruleId = ruleName;
			const embeddedResult = await safeCall(
				() => worker(ruleName, rule, ruleCtx),
				'rule ' + ruleName + ' crashed on ' + document.uri,
			);
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

export async function safeCall<T>(cb: () => Promise<T> | T, errorMsg?: string) {
	try {
		return await cb();
	}
	catch (err) {
		console.warn(errorMsg, err);
	}
}
