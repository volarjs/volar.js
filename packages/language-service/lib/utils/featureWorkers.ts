import type { VirtualCode } from '@volar/language-core';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { URI } from 'vscode-uri';
import type { SourceMapWithDocuments } from '../documents';
import type { LanguageServicePlugin, LanguageServicePluginInstance, LanguageServiceContext } from '../types';

export function documentFeatureWorker<T>(
	context: LanguageServiceContext,
	uri: URI,
	valid: (map: SourceMapWithDocuments) => boolean,
	worker: (plugin: [LanguageServicePlugin, LanguageServicePluginInstance], document: TextDocument) => Thenable<T | null | undefined> | T | null | undefined,
	transformResult: (result: T, map?: SourceMapWithDocuments) => T | undefined,
	combineResult?: (results: T[]) => T
) {
	return languageFeatureWorker(
		context,
		uri,
		() => void 0,
		function* (map) {
			if (valid(map)) {
				yield;
			}
		},
		worker,
		transformResult,
		combineResult
	);
}

export async function languageFeatureWorker<T, K>(
	context: LanguageServiceContext,
	uri: URI,
	getRealDocParams: () => K,
	eachVirtualDocParams: (map: SourceMapWithDocuments) => Generator<K>,
	worker: (plugin: [LanguageServicePlugin, LanguageServicePluginInstance], document: TextDocument, params: K, map?: SourceMapWithDocuments) => Thenable<T | null | undefined> | T | null | undefined,
	transformResult: (result: T, map?: SourceMapWithDocuments) => T | undefined,
	combineResult?: (results: T[]) => T
) {
	const sourceScript = context.language.scripts.get(uri);
	if (!sourceScript) {
		return;
	}

	let results: T[] = [];

	if (sourceScript.generated) {

		for (const map of forEachEmbeddedDocument(context, sourceScript.id, sourceScript.generated.root)) {

			if (results.length && !combineResult) {
				continue;
			}

			for (const mappedArg of eachVirtualDocParams(map)) {

				if (results.length && !combineResult) {
					continue;
				}

				for (const [pluginIndex, plugin] of Object.entries(context.plugins)) {
					if (context.disabledServicePlugins.has(plugin[1])) {
						continue;
					}

					if (results.length && !combineResult) {
						continue;
					}

					const rawResult = await safeCall(
						() => worker(plugin, map.embeddedDocument, mappedArg, map),
						`Language service plugin "${plugin[0].name}" (${pluginIndex}) failed to provide document feature for ${map.embeddedDocument.uri}.`
					);
					if (!rawResult) {
						continue;
					}
					const mappedResult = transformResult(rawResult, map);
					if (!mappedResult) {
						continue;
					}

					results.push(mappedResult);
				}
			}
		}
	}
	else {

		const document = context.documents.get(uri, sourceScript.languageId, sourceScript.snapshot);
		const params = getRealDocParams();

		for (const [pluginIndex, plugin] of Object.entries(context.plugins)) {
			if (context.disabledServicePlugins.has(plugin[1])) {
				continue;
			}

			const embeddedResult = await safeCall(
				() => worker(plugin, document, params, undefined),
				`Language service plugin "${plugin[0].name}" (${pluginIndex}) failed to provide document feature for ${document.uri}.`
			);
			if (!embeddedResult) {
				continue;
			}

			const result = transformResult(embeddedResult, undefined);
			if (!result) {
				continue;
			}

			results.push(result);

			if (!combineResult) {
				break;
			}
		}
	}

	if (combineResult && results.length > 0) {
		const combined = combineResult(results);
		return combined;
	}
	else if (results.length > 0) {
		return results[0];
	}
}

export async function safeCall<T>(cb: () => Thenable<T> | T, errorMsg?: string) {
	try {
		return await cb();
	}
	catch (err) {
		console.warn(errorMsg, err);
	}
}

export function* forEachEmbeddedDocument(
	context: LanguageServiceContext,
	sourceScriptId: URI,
	current: VirtualCode
): Generator<SourceMapWithDocuments> {

	if (current.embeddedCodes) {
		for (const embeddedCode of current.embeddedCodes) {
			yield* forEachEmbeddedDocument(context, sourceScriptId, embeddedCode);
		}
	}

	const map = context.documents.getSourceMap(current);
	if (!context.disabledEmbeddedDocumentUris.get(context.encodeEmbeddedDocumentUri(sourceScriptId, current.id))) {
		yield map;
	}
}

export function getEmbeddedFilesByLevel(context: LanguageServiceContext, sourceFileUri: URI, rootFile: VirtualCode, level: number) {

	const embeddedFilesByLevel: VirtualCode[][] = [[rootFile]];

	while (true) {

		if (embeddedFilesByLevel.length > level) {
			return embeddedFilesByLevel[level];
		}

		const nextLevel: VirtualCode[] = [];

		for (const file of embeddedFilesByLevel[embeddedFilesByLevel.length - 1]) {
			if (file.embeddedCodes) {
				for (const embedded of file.embeddedCodes) {
					if (!context.disabledEmbeddedDocumentUris.get(context.encodeEmbeddedDocumentUri(sourceFileUri, embedded.id))) {
						nextLevel.push(embedded);
					}
				}
			}
		}

		embeddedFilesByLevel.push(nextLevel);
	}
}
