import type { CodeInformation, VirtualCode } from '@volar/language-core';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { URI } from 'vscode-uri';
import type { SourceMapWithDocuments } from '../documents';
import type { LanguageServicePlugin, LanguageServicePluginInstance, ServiceContext } from '../types';

export async function documentFeatureWorker<T>(
	context: ServiceContext,
	uri: URI,
	valid: (map: SourceMapWithDocuments<CodeInformation>) => boolean,
	worker: (service: [LanguageServicePlugin, LanguageServicePluginInstance], document: TextDocument) => Thenable<T | null | undefined> | T | null | undefined,
	transformResult: (result: T, map?: SourceMapWithDocuments<CodeInformation>) => T | undefined,
	combineResult?: (results: T[]) => T,
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
		combineResult,
	);
}

export async function languageFeatureWorker<T, K>(
	context: ServiceContext,
	uri: URI,
	getReadDocParams: () => K,
	eachVirtualDocParams: (map: SourceMapWithDocuments<CodeInformation>) => Generator<K>,
	worker: (service: [LanguageServicePlugin, LanguageServicePluginInstance], document: TextDocument, params: K, map?: SourceMapWithDocuments<CodeInformation>) => Thenable<T | null | undefined> | T | null | undefined,
	transformResult: (result: T, map?: SourceMapWithDocuments<CodeInformation>) => T | undefined,
	combineResult?: (results: T[]) => T,
) {
	const sourceScript = context.language.scripts.get(uri);
	if (!sourceScript) {
		return;
	}

	let results: T[] = [];

	if (sourceScript.generated) {

		for (const map of forEachEmbeddedDocument(context, sourceScript.id, sourceScript.generated.root)) {

			for (const mappedArg of eachVirtualDocParams(map)) {

				for (const [serviceId, service] of Object.entries(context.services)) {
					if (context.disabledServicePlugins.has(service[1])) {
						continue;
					}

					const embeddedResult = await safeCall(
						() => worker(service, map.embeddedDocument, mappedArg, map),
						'service ' + serviceId + ' crashed on ' + map.embeddedDocument.uri,
					);
					if (!embeddedResult) {
						continue;
					}

					const result = transformResult(embeddedResult, map);
					if (!result) {
						continue;
					}

					results.push(result);

					if (!combineResult) {
						break;
					}
				}
			}
		}
	}
	else {

		const document = context.documents.get(uri, sourceScript.languageId, sourceScript.snapshot);
		const params = getReadDocParams();

		for (const [serviceId, service] of Object.entries(context.services)) {
			if (context.disabledServicePlugins.has(service[1])) {
				continue;
			}

			const embeddedResult = await safeCall(
				() => worker(service, document, params, undefined),
				'service ' + serviceId + ' crashed on ' + uri,
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
		return combineResult(results);
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
	context: ServiceContext,
	sourceScriptId: URI,
	current: VirtualCode,
): Generator<SourceMapWithDocuments<CodeInformation>> {

	if (current.embeddedCodes) {
		for (const embeddedCode of current.embeddedCodes) {
			yield* forEachEmbeddedDocument(context, sourceScriptId, embeddedCode);
		}
	}

	for (const map of context.documents.getMaps(current)) {
		if (
			sourceScriptId.toString() === map.sourceDocument.uri
			&& !context.disabledEmbeddedDocumentUris.get(context.encodeEmbeddedDocumentUri(sourceScriptId, current.id))
		) {
			yield map;
		}
	}
}

export function getEmbeddedFilesByLevel(context: ServiceContext, sourceFileUri: URI, rootFile: VirtualCode, level: number) {

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
