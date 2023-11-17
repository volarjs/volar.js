import { FileRangeCapabilities, VirtualFile } from '@volar/language-core';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { SourceMapWithDocuments } from '../documents';
import { Service, ServiceContext } from '../types';
import { visitEmbedded } from './definePlugin';

export async function documentFeatureWorker<T>(
	context: ServiceContext,
	uri: string,
	isValidSourceMap: (file: VirtualFile, sourceMap: SourceMapWithDocuments<FileRangeCapabilities>) => boolean,
	worker: (service: ReturnType<Service>, document: TextDocument) => T,
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
	context: ServiceContext,
	uri: string,
	arg: K,
	transformArg: (arg: K, sourceMap: SourceMapWithDocuments<FileRangeCapabilities>, file: VirtualFile) => Generator<K> | K[],
	worker: (service: ReturnType<Service>, document: TextDocument, arg: K, sourceMap: SourceMapWithDocuments<FileRangeCapabilities> | undefined, file: VirtualFile | undefined) => T,
	transform: (result: NonNullable<Awaited<T>>, sourceMap: SourceMapWithDocuments<FileRangeCapabilities> | undefined) => Awaited<T> | undefined,
	combineResult?: (results: NonNullable<Awaited<T>>[]) => NonNullable<Awaited<T>>,
	reportProgress?: (result: NonNullable<Awaited<T>>) => void,
) {

	const document = context.getTextDocument(uri);
	const virtualFile = context.project.fileProvider.getSourceFile(uri)?.root;

	let results: NonNullable<Awaited<T>>[] = [];

	if (virtualFile) {

		await visitEmbedded(context, virtualFile, async (file, map) => {

			for (const mappedArg of transformArg(arg, map, file)) {

				for (const [serviceId, service] of Object.entries(context.services)) {

					const embeddedResult = await safeCall(
						() => worker(service, map.virtualFileDocument, mappedArg, map, file),
						'service ' + serviceId + ' crashed on ' + map.virtualFileDocument.uri,
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

		for (const [serviceId, service] of Object.entries(context.services)) {

			const embeddedResult = await safeCall(
				() => worker(service, document, arg, undefined, undefined),
				'service ' + serviceId + ' crashed on ' + uri,
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
