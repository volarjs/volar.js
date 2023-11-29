import { SnapshotDocument } from '@volar/snapshot-document';
import * as vscode from 'vscode-languageserver';

export function createDocumentManager(connection: vscode.Connection) {

	const documents = new vscode.TextDocuments<SnapshotDocument>({
		create(uri, languageId, version, text) {
			return new SnapshotDocument(uri, languageId, version, text);
		},
		update(snapshot, contentChanges, version) {
			snapshot.update(contentChanges, version);
			return snapshot;
		},
	});

	documents.listen(connection);

	return documents;
}
