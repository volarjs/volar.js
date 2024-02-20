import type { CodeInformation, VirtualCode } from '@volar/language-core';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SourceMapWithDocuments } from '../documents';
import type { ServiceContext, ServicePluginInstance, ServicePlugin } from '../types';

export async function documentFeatureWorker<T>(
	context: ServiceContext,
	uri: string,
	valid: (map: SourceMapWithDocuments<CodeInformation>) => boolean,
	worker: (service: [ServicePlugin, ServicePluginInstance], document: TextDocument) => Thenable<T | null | undefined> | T | null | undefined,
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
	uri: string,
	getReadDocParams: () => K,
	eachVirtualDocParams: (map: SourceMapWithDocuments<CodeInformation>) => Generator<K>,
	worker: (service: [ServicePlugin, ServicePluginInstance], document: TextDocument, params: K, map?: SourceMapWithDocuments<CodeInformation>) => Thenable<T | null | undefined> | T | null | undefined,
	transformResult: (result: T, map?: SourceMapWithDocuments<CodeInformation>) => T | undefined,
	combineResult?: (results: T[]) => T,
) {

	const sourceFile = context.language.files.get(uri);
	if (!sourceFile) {
		return;
	}

	let results: T[] = [];

	if (sourceFile.generated) {

		for (const map of eachEmbeddedDocument(context, sourceFile.generated.code)) {

			for (const mappedArg of eachVirtualDocParams(map)) {

				for (const [serviceId, service] of Object.entries(context.services)) {
					if (context.disabledServicePlugins.has(service[1])) {
						continue;
					}

					const embeddedResult = await safeCall(
						() => worker(service, map.virtualFileDocument, mappedArg, map),
						'service ' + serviceId + ' crashed on ' + map.virtualFileDocument.uri,
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

		const document = context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);
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

export function* eachEmbeddedDocument(
	context: ServiceContext,
	current: VirtualCode,
	rootCode = current,
): Generator<SourceMapWithDocuments<CodeInformation>> {

	if (current.embeddedCodes) {
		for (const embeddedCode of current.embeddedCodes) {
			yield* eachEmbeddedDocument(context, embeddedCode, rootCode);
		}
	}

	for (const map of context.documents.getMaps(current)) {
		const sourceFile = context.language.files.get(map.sourceFileDocument.uri);
		if (
			sourceFile?.generated?.code === rootCode
			&& !context.disabledVirtualFileUris.has(context.documents.getVirtualCodeUri(context.language.files.getByVirtualCode(current).id, current.id))
		) {
			yield map;
		}
	}
}

export function getEmbeddedFilesByLevel(context: ServiceContext, sourceFileUri: string, rootFile: VirtualCode, level: number) {

	const embeddedFilesByLevel: VirtualCode[][] = [[rootFile]];

	while (true) {

		if (embeddedFilesByLevel.length > level) {
			return embeddedFilesByLevel[level];
		}

		const nextLevel: VirtualCode[] = [];

		for (const file of embeddedFilesByLevel[embeddedFilesByLevel.length - 1]) {
			if (file.embeddedCodes) {
				for (const embedded of file.embeddedCodes) {
					if (!context.disabledVirtualFileUris.has(context.documents.getVirtualCodeUri(sourceFileUri, embedded.id))) {
						nextLevel.push(embedded);
					}
				}
			}
		}

		embeddedFilesByLevel.push(nextLevel);
	}
}
