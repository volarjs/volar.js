import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { combineChangeRanges } from './utils/combineChangeRanges';

interface IncrementalScriptSnapshotChange {
	applied: boolean,
	changeRange: ts.TextChangeRange | undefined,
	version: number,
	contentChange: {
		range: vscode.Range;
		text: string;
	} | undefined,
	snapshot: WeakRef<ts.IScriptSnapshot> | undefined,
}

class IncrementalScriptSnapshot {

	private document: TextDocument;
	uri: string;
	changes: IncrementalScriptSnapshotChange[];

	constructor(uri: string, languageId: string, version: number, text: string) {
		this.uri = uri;
		this.document = TextDocument.create(uri, languageId, version, text);
		this.changes = [
			{
				applied: true,
				changeRange: undefined,
				version,
				contentChange: undefined,
				snapshot: undefined,
			}
		];
	}

	get version() {
		return this.changes[this.changes.length - 1].version;
	}

	get languageId() {
		return this.document.languageId;
	}

	update(contentChanges: vscode.TextDocumentContentChangeEvent[], version: number) {
		TextDocument.update(this.document, contentChanges, version);
		this.changes = [
			{
				applied: true,
				changeRange: undefined,
				version: version,
				contentChange: undefined,
				snapshot: undefined,
			}
		];
	}

	getSnapshot() {

		this.clearUnReferenceVersions();

		const lastChange = this.changes[this.changes.length - 1];
		if (!lastChange.snapshot) {
			this.applyVersionChanges(lastChange.version, false);
			const text = this.document.getText();
			const cache = new WeakMap<ts.IScriptSnapshot, ts.TextChangeRange | undefined>();
			const snapshot: ts.IScriptSnapshot = {
				getText: (start, end) => text.substring(start, end),
				getLength: () => text.length,
				getChangeRange: (oldSnapshot) => {
					if (!cache.has(oldSnapshot)) {
						const oldIndex = this.changes.findIndex(change => change.snapshot?.deref() === oldSnapshot);
						if (oldIndex >= 0) {
							const start = oldIndex + 1;
							const end = this.changes.indexOf(lastChange) + 1;
							const changeRanges = this.changes.slice(start, end).map(change => change.changeRange!);
							const result = combineChangeRanges.apply(null, changeRanges);
							cache.set(oldSnapshot, result);
						}
						else {
							cache.set(oldSnapshot, undefined);
						}
					}
					return cache.get(oldSnapshot);
				},
			};
			lastChange.snapshot = new WeakRef(snapshot);
		}

		return lastChange.snapshot.deref()!;
	}

	getDocument() {

		this.clearUnReferenceVersions();

		const lastChange = this.changes[this.changes.length - 1];
		if (!lastChange.applied) {
			this.applyVersionChanges(lastChange.version, false);
		}

		return this.document;
	}

	clearUnReferenceVersions() {
		let versionToApply: number | undefined;
		for (let i = 0; i <= this.changes.length - 2; i++) {
			const change = this.changes[i];
			const nextChange = this.changes[i + 1];
			if (!change.snapshot?.deref()) {
				if (change.version !== nextChange.version) {
					versionToApply = change.version;
				}
			}
			else {
				break;
			}
		}
		if (versionToApply !== undefined) {
			this.applyVersionChanges(versionToApply, true);
		}
	}

	applyVersionChanges(version: number, removeBeforeVersions: boolean) {
		let removeEnd = -1;
		for (let i = 0; i < this.changes.length; i++) {
			const change = this.changes[i];
			if (change.version > version) {
				break;
			}
			if (!change.applied) {
				if (change.contentChange) {
					change.changeRange = {
						span: {
							start: this.document.offsetAt(change.contentChange.range.start),
							length: this.document.offsetAt(change.contentChange.range.end) - this.document.offsetAt(change.contentChange.range.start),
						},
						newLength: change.contentChange.text.length,
					};
					TextDocument.update(this.document, [change.contentChange], change.version);
				}
				change.applied = true;
			}
			removeEnd = i + 1;
		}
		if (removeBeforeVersions && removeEnd >= 1) {
			this.changes.splice(0, removeEnd);
		}
	}
}

export function createDocumentManager(connection: vscode.Connection) {

	const documents = new vscode.TextDocuments<IncrementalScriptSnapshot>({
		create(uri, languageId, version, text) {
			return new IncrementalScriptSnapshot(uri, languageId, version, text);
		},
		update(snapshot, params, version) {
			snapshot.update(params, version);
			return snapshot;
		},
	});

	documents.listen(connection);

	return documents;
}
