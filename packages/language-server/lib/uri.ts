import type { TextDocument, TextDocuments } from 'vscode-languageserver';
import { URI } from 'vscode-uri';

export type UriConverter = ReturnType<typeof createUriConverter>;

export function createUriConverter(documents?: TextDocuments<TextDocument>) {
	const syncedDocumentUriToFileName = new Map<string, string>();
	const syncedDocumentFileNameToUri = new Map<string, string>();
	const encodeds = new Map<string, URI>();

	documents?.onDidOpen(({ document }) => {
		const fileName = uriToFileName(document.uri);
		syncedDocumentUriToFileName.set(document.uri, fileName);
		syncedDocumentFileNameToUri.set(fileName, document.uri);
	});
	documents?.onDidClose(e => {
		const fileName = syncedDocumentUriToFileName.get(e.document.uri);
		assert(fileName, 'fileName not found');
		syncedDocumentUriToFileName.delete(e.document.uri);
		syncedDocumentFileNameToUri.delete(fileName);
	});

	return {
		uriToFileName,
		fileNameToUri,
	};

	function uriToFileName(uri: string, parsed?: URI) {
		const syncedDocumentFileName = syncedDocumentUriToFileName.get(uri);
		if (syncedDocumentFileName) {
			return syncedDocumentFileName;
		}
		parsed ??= URI.parse(uri);
		if (parsed.scheme === 'file') {
			return parsed.fsPath.replace(/\\/g, '/');
		}
		const encoded = encodeURIComponent(`${parsed.scheme}://${parsed.authority}`);
		encodeds.set(encoded, parsed);
		return `/${encoded}${parsed.path}`;
	}

	function fileNameToUri(fileName: string) {
		const syncedDocumentUri = syncedDocumentFileNameToUri.get(fileName);
		if (syncedDocumentUri) {
			return syncedDocumentUri;
		}
		for (const [encoded, uri] of encodeds) {
			const prefix = `/${encoded}`;
			if (fileName.startsWith(prefix)) {
				return URI.from({
					scheme: uri.scheme,
					authority: uri.authority,
					path: fileName.substring(prefix.length),
				}).toString();
			}
		}
		return URI.file(fileName).toString();
	}
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}
