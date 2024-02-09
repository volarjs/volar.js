import * as vscode from 'vscode';
import type { BaseLanguageClient } from 'vscode-languageclient';
import { AutoInsertRequest } from '@volar/language-server/protocol';

export function activate(selector: vscode.DocumentSelector, client: BaseLanguageClient) {

	let isEnabled = false;
	let timeout: NodeJS.Timeout | undefined;

	updateEnabledState();

	const disposables = [
		vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument, null),
		vscode.window.onDidChangeActiveTextEditor(updateEnabledState, null),
	];

	return vscode.Disposable.from(...disposables);

	function updateEnabledState() {
		isEnabled = false;
		let editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}
		let document = editor.document;
		if (!vscode.languages.match(selector, document)) {
			return;
		}
		isEnabled = true;
	}

	function onDidChangeTextDocument({ document, contentChanges, reason }: vscode.TextDocumentChangeEvent) {
		if (!isEnabled || contentChanges.length === 0 || reason === vscode.TextDocumentChangeReason.Undo || reason === vscode.TextDocumentChangeReason.Redo) {
			return;
		}
		const activeDocument = vscode.window.activeTextEditor?.document;
		if (document !== activeDocument) {
			return;
		}
		if (timeout) {
			clearTimeout(timeout);
		}

		const lastChange = contentChanges[contentChanges.length - 1];
		doAutoInsert(document, lastChange);
	}

	function doAutoInsert(document: vscode.TextDocument, lastChange: vscode.TextDocumentContentChangeEvent) {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		const version = document.version;
		timeout = setTimeout(async () => {
			timeout = undefined;

			const isCancel = () => document !== vscode.window.activeTextEditor?.document
				|| vscode.window.activeTextEditor?.document.version !== version;
			if (isCancel()) {
				return;
			}

			const rangeStart = lastChange.range.start;
			const position = new vscode.Position(rangeStart.line, rangeStart.character + lastChange.text.length);
			const params = {
				...client.code2ProtocolConverter.asTextDocumentPositionParams(document, position),
				lastChange: {
					text: lastChange.text,
					range: client.code2ProtocolConverter.asRange(lastChange.range),
				},
			};
			const insertion = await client.sendRequest(AutoInsertRequest.type, params);
			const activeEditor = vscode.window.activeTextEditor;

			if (
				insertion !== undefined
				&& insertion !== null
				&& isEnabled
				&& !isCancel()
				&& activeEditor
			) {
				if (typeof insertion === 'string') {
					const selections = activeEditor.selections;
					if (selections.length && selections.some(s => s.active.isEqual(position))) {
						activeEditor.insertSnippet(new vscode.SnippetString(insertion), selections.map(s => s.active));
					}
					else {
						activeEditor.insertSnippet(new vscode.SnippetString(insertion), position);
					}
				}
				else {
					const edit = client.protocol2CodeConverter.asTextEdit(insertion);
					activeEditor.insertSnippet(new vscode.SnippetString(edit.newText), edit.range);
				}
			}
		}, 100);
	}
}
