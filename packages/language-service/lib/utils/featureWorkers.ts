import { CodeInformations } from '@volar/language-core';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { SourceMapWithDocuments } from '../documents';
import { Service, ServiceContext } from '../types';
import { visitEmbedded } from './definePlugin';

export async function documentFeatureWorker<T>(
	context: ServiceContext,
	uri: string,
	valid: (map: SourceMapWithDocuments<CodeInformations>) => boolean,
	worker: (service: ReturnType<Service>, document: TextDocument) => Thenable<T | null | undefined> | T | null | undefined,
	transformResult: (result: T, map?: SourceMapWithDocuments<CodeInformations>) => T | undefined,
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
	eachVirtualDocParams: (map: SourceMapWithDocuments<CodeInformations>) => Generator<K>,
	worker: (service: ReturnType<Service>, document: TextDocument, params: K, map?: SourceMapWithDocuments<CodeInformations>) => Thenable<T | null | undefined> | T | null | undefined,
	transformResult: (result: T, map?: SourceMapWithDocuments<CodeInformations>) => T | undefined,
	combineResult?: (results: T[]) => T,
) {

	const sourceFile = context.project.fileProvider.getSourceFile(uri);
	if (!sourceFile)
		return;

	let results: T[] = [];

	if (sourceFile.root) {

		await visitEmbedded(context, sourceFile.root, async (_file, map) => {

			for (const mappedArg of eachVirtualDocParams(map)) {

				for (const [serviceId, service] of Object.entries(context.services)) {

					const embeddedResult = await safeCall(
						() => worker(service, map.virtualFileDocument, mappedArg, map),
						'service ' + serviceId + ' crashed on ' + map.virtualFileDocument.uri,
					);
					if (!embeddedResult)
						continue;

					const result = transformResult(embeddedResult!, map);
					if (!result)
						continue;

					results.push(result!);

					if (!combineResult)
						return false;
				}
			}

			return true;
		});
	}
	else {

		const document = context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);
		const params = getReadDocParams();

		for (const [serviceId, service] of Object.entries(context.services)) {

			const embeddedResult = await safeCall(
				() => worker(service, document, params, undefined),
				'service ' + serviceId + ' crashed on ' + uri,
			);
			if (!embeddedResult)
				continue;

			const result = transformResult(embeddedResult, undefined);
			if (!result)
				continue;

			results.push(result);

			if (!combineResult)
				break;
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
