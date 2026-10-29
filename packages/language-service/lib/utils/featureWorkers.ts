import {
	type LinkedCodeMap,
	type Mapper,
	type SourceScript,
	SpanMapFeature,
	SpanMapFidelity,
	type VirtualCode,
} from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { URI } from 'vscode-uri';
import type { LanguageServiceContext, LanguageServicePlugin, LanguageServicePluginInstance } from '../types';

export type DocumentsAndMap = [
	sourceDocument: TextDocument,
	embeddedDocument: TextDocument,
	map: Mapper,
];

export function documentFeatureWorker<T>(
	context: LanguageServiceContext,
	uri: URI,
	valid: (info: DocumentsAndMap) => boolean,
	worker: (
		plugin: [LanguageServicePlugin, LanguageServicePluginInstance],
		document: TextDocument,
	) => Thenable<T | null | undefined> | T | null | undefined,
	transformResult: (result: T, map?: DocumentsAndMap) => T | undefined,
	combineResult?: (results: T[]) => T,
) {
	return languageFeatureWorker(
		context,
		uri,
		() => void 0,
		function*(map) {
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
	context: LanguageServiceContext,
	uri: URI,
	getRealDocParams: () => K,
	eachVirtualDocParams: (map: DocumentsAndMap) => Generator<K>,
	worker: (
		plugin: [LanguageServicePlugin, LanguageServicePluginInstance],
		document: TextDocument,
		params: K,
		map?: DocumentsAndMap,
	) => Thenable<T | null | undefined> | T | null | undefined,
	transformResult: (result: T, map?: DocumentsAndMap) => T | undefined,
	combineResult?: (results: T[]) => T,
) {
	let sourceScript: SourceScript<URI> | undefined;
	const decoded = context.decodeEmbeddedDocumentUri(uri);
	if (decoded) {
		sourceScript = context.language.scripts.get(decoded[0]);
	}
	else {
		sourceScript = context.language.scripts.get(uri);
	}
	if (!sourceScript) {
		return;
	}

	let results: T[] = [];

	if (decoded) {
		const virtualCode = sourceScript.generated?.embeddedCodes.get(decoded[1]);
		if (virtualCode) {
			const docs: DocumentsAndMap = [
				context.documents.get(sourceScript.id, sourceScript.languageId, sourceScript.snapshot),
				context.documents.get(uri, virtualCode.languageId, virtualCode.snapshot),
				context.language.maps.get(virtualCode, sourceScript),
			];
			await docsWorker(docs, false);
		}
	}
	else if (sourceScript.generated) {
		for (const docs of forEachEmbeddedDocument(context, sourceScript, sourceScript.generated.root)) {
			if (results.length && !combineResult) {
				continue;
			}
			await docsWorker(docs, true);
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
				`Language service plugin "${
					plugin[0].name
				}" (${pluginIndex}) failed to provide document feature for ${document.uri}.`,
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

	async function docsWorker(docs: DocumentsAndMap, transform: boolean) {
		for (const mappedArg of eachVirtualDocParams(docs)) {
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

				const embeddedResult = await safeCall(
					() => worker(plugin, docs[1], mappedArg, docs),
					`Language service plugin "${plugin[0].name}" (${pluginIndex}) failed to provide document feature for ${
						docs[1].uri
					}.`,
				);
				if (!embeddedResult) {
					continue;
				}
				if (transform) {
					const mappedResult = transformResult(embeddedResult, docs);
					if (mappedResult) {
						results.push(mappedResult);
					}
				}
				else {
					results.push(embeddedResult);
				}
			}
		}
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
	sourceScript: SourceScript<URI>,
	current: VirtualCode,
): Generator<DocumentsAndMap> {
	if (current.embeddedCodes) {
		for (const embeddedCode of current.embeddedCodes) {
			yield* forEachEmbeddedDocument(context, sourceScript, embeddedCode);
		}
	}
	const embeddedDocumentUri = context.encodeEmbeddedDocumentUri(sourceScript.id, current.id);
	if (!context.disabledEmbeddedDocumentUris.get(embeddedDocumentUri)) {
		yield [
			context.documents.get(sourceScript.id, sourceScript.languageId, sourceScript.snapshot),
			context.documents.get(embeddedDocumentUri, current.languageId, current.snapshot),
			context.language.maps.get(current, sourceScript),
		];
	}
}

/** The first source range of `range`, through a single segment, or approximate unless `fidelity` is stricter. */
export function getSourceRange(
	docs: DocumentsAndMap,
	range: vscode.Range,
	feature?: SpanMapFeature,
	fidelity = SpanMapFidelity.Approximate,
) {
	for (const result of getSourceRanges(docs, range, feature)) {
		if (result.fidelity <= fidelity) {
			return { start: result.start, end: result.end };
		}
	}
}

export function getGeneratedRange(
	docs: DocumentsAndMap,
	range: vscode.Range,
	feature?: SpanMapFeature,
) {
	for (const result of getGeneratedRanges(docs, range, feature)) {
		return { start: result.start, end: result.end };
	}
}

export function* getSourceRanges(
	[sourceDocument, embeddedDocument, map]: DocumentsAndMap,
	range: vscode.Range,
	feature?: SpanMapFeature,
) {
	for (
		const mapped of map.virtualToOriginalSpans(
			embeddedDocument.offsetAt(range.start),
			embeddedDocument.offsetAt(range.end),
			feature,
		)
	) {
		yield {
			start: sourceDocument.positionAt(mapped.start),
			end: sourceDocument.positionAt(mapped.end),
			fidelity: mapped.fidelity,
		};
	}
}

export function* getGeneratedRanges(
	[sourceDocument, embeddedDocument, map]: DocumentsAndMap,
	range: vscode.Range,
	feature?: SpanMapFeature,
) {
	for (
		const mapped of map.originalToVirtualSpans(
			sourceDocument.offsetAt(range.start),
			sourceDocument.offsetAt(range.end),
			feature,
		)
	) {
		yield {
			start: embeddedDocument.positionAt(mapped.start),
			end: embeddedDocument.positionAt(mapped.end),
			fidelity: mapped.fidelity,
		};
	}
}

export function* getSourcePositions(
	[sourceDocument, embeddedDocument, map]: DocumentsAndMap,
	position: vscode.Position,
	feature?: SpanMapFeature,
) {
	for (const mapped of map.virtualToOriginalPositions(embeddedDocument.offsetAt(position), feature)) {
		yield sourceDocument.positionAt(mapped.position);
	}
}

export function* getGeneratedPositions(
	[sourceDocument, embeddedDocument, map]: DocumentsAndMap,
	position: vscode.Position,
	feature?: SpanMapFeature,
) {
	for (const mapped of map.originalToVirtualPositions(sourceDocument.offsetAt(position), feature)) {
		yield embeddedDocument.positionAt(mapped.position);
	}
}

export function* getLinkedCodePositions(document: TextDocument, linkedMap: LinkedCodeMap, posotion: vscode.Position) {
	for (const linkedPosition of linkedMap.getLinkedOffsets(document.offsetAt(posotion))) {
		yield document.positionAt(linkedPosition);
	}
}
