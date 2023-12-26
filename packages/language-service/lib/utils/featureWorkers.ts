import type { CodeInformation, VirtualFile } from '@volar/language-core';
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

	const sourceFile = context.language.files.getSourceFile(context.env.uriToFileName(uri));
	if (!sourceFile) {
		return;
	}

	let results: T[] = [];

	if (sourceFile.virtualFile) {

		await visitEmbedded(context, sourceFile.virtualFile[0], async (_file, map) => {

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

					const result = transformResult(embeddedResult!, map);
					if (!result) {
						continue;
					}

					results.push(result!);

					if (!combineResult) {
						return false;
					}
				}
			}

			return true;
		});
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

export async function visitEmbedded(
	context: ServiceContext,
	current: VirtualFile,
	cb: (file: VirtualFile, sourceMap: SourceMapWithDocuments<CodeInformation>) => Promise<boolean>,
	rootFile = current,
) {

	for (const embedded of current.embeddedFiles) {
		if (!await visitEmbedded(context, embedded, cb, rootFile)) {
			return false;
		}
	}

	for (const map of context.documents.getMaps(current)) {
		const sourceFile = context.language.files.getSourceFile(context.env.uriToFileName(map.sourceFileDocument.uri));
		if (
			sourceFile?.virtualFile?.[0] === rootFile
			&& !context.disabledVirtualFiles.has(current.fileName)
			&& !await cb(current, map)
		) {
			return false;
		}
	}

	return true;
}

export function getEmbeddedFilesByLevel(context: ServiceContext, rootFile: VirtualFile, level: number) {

	const embeddedFilesByLevel: VirtualFile[][] = [[rootFile]];

	while (true) {

		if (embeddedFilesByLevel.length > level) {
			return embeddedFilesByLevel[level];
		}

		let nextLevel: VirtualFile[] = [];

		for (const file of embeddedFilesByLevel[embeddedFilesByLevel.length - 1]) {
			nextLevel = nextLevel.concat(file.embeddedFiles.filter(file => !context.disabledVirtualFiles.has(file.fileName)));
		}

		embeddedFilesByLevel.push(nextLevel);
	}
}
