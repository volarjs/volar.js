import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { SnapshotDocument } from '../utils/snapshotDocument';

export function register(
	connection: vscode.Connection,
	serverCapabilities: vscode.ServerCapabilities
) {
	const syncedDocumentParsedUriToUri = new Map<string, string>();
	const documentsCache = new Map<string, WeakRef<SnapshotDocument>>();
	const documents = new vscode.TextDocuments({
		create(uri, languageId, version, text) {
			const cache = documentsCache.get(uri)?.deref();
			if (cache && cache.languageId === languageId && cache.version === version && cache.getText() === text) {
				return cache;
			}
			const document = new SnapshotDocument(uri, languageId, version, text);
			documentsCache.set(uri, new WeakRef(document));
			return document;
		},
		update(snapshot, contentChanges, version) {
			snapshot.update(contentChanges, version);
			return snapshot;
		},
	});

	documents.listen(connection);
	documents.onDidOpen(({ document }) => {
		const parsedUri = URI.parse(document.uri);
		syncedDocumentParsedUriToUri.set(parsedUri.toString(), document.uri);
	});
	documents.onDidClose(({ document }) => {
		const parsedUri = URI.parse(document.uri);
		syncedDocumentParsedUriToUri.delete(parsedUri.toString());
	});

	serverCapabilities.textDocumentSync = vscode.TextDocumentSyncKind.Incremental;

	return {
		all: documents.all.bind(documents),
		onDidChangeContent: documents.onDidChangeContent.bind(documents),
		onDidOpen: documents.onDidOpen.bind(documents),
		onDidClose: documents.onDidClose.bind(documents),
		onDidSave: documents.onDidSave.bind(documents),
		get(uri: URI) {
			return documents.get(getSyncedDocumentKey(uri) ?? uri.toString());
		},
	};

	function getSyncedDocumentKey(uri: URI) {
		const originalUri = syncedDocumentParsedUriToUri.get(uri.toString());
		if (originalUri) {
			return originalUri;
		}
	}
}
