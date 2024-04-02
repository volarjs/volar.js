import * as vscode from 'vscode';
import type { BaseLanguageClient } from 'vscode-languageclient';
import { AutoInsertRequest } from '@volar/language-server/protocol';
import type { LanguageServicePlugin } from '@volar/language-server';

export function activate(selector: vscode.DocumentSelector, client: BaseLanguageClient) {

	let isEnabled = false;
	let timeout: ReturnType<typeof setTimeout> | undefined;

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
		const lastChange = contentChanges[contentChanges.length - 1];
		doAutoInsert(document, lastChange);
	}

	function doAutoInsert(document: vscode.TextDocument, lastChange: vscode.TextDocumentContentChangeEvent) {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		const version = document.version;
		const lastCharacter = lastChange.text[lastChange.text.length - 1];
		const isCancel = () => {
			if (document !== vscode.window.activeTextEditor?.document) {
				return true;
			}
			if (vscode.window.activeTextEditor?.document.version !== version) {
				return true;
			}
			const triggerCharacters: LanguageServicePlugin['autoInsertionTriggerCharacters'] = client.initializeResult?.autoInsertion.triggerCharacters;
			for (const char of triggerCharacters ?? []) {
				if (typeof char === 'string') {
					if (lastCharacter.match(new RegExp(char))) {
						return false;
					}
				}
				else {
					if (
						char.characters.some(char => lastCharacter.match(new RegExp(char)))
						&& vscode.workspace.getConfiguration().get<boolean>(char.configurationSection)
					) {
						return false;
					}
				}
			}
			return true;
		};

		timeout = setTimeout(async () => {
			timeout = undefined;
			if (isCancel()) {
				return;
			}
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				return;
			}
			const newTextRange = new vscode.Range(
				lastChange.range.start,
				document.positionAt(
					document.offsetAt(lastChange.range.start)
					+ lastChange.text.length
				)
			);
			const selection = activeEditor.selections.find(selection => newTextRange.contains(selection.active))?.active;
			if (!selection) {
				return;
			}
			const params: AutoInsertRequest.ParamsType = {
				textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document),
				selection: client.code2ProtocolConverter.asPosition(selection),
				change: {
					rangeLength: lastChange.rangeLength,
					rangeOffset: lastChange.rangeOffset,
					text: lastChange.text,
				},
			};
			const insertion = await client.sendRequest(AutoInsertRequest.type, params);
			if (insertion && isEnabled && !isCancel()) {
				activeEditor.insertSnippet(new vscode.SnippetString(insertion));
			}
		}, 100);
	}
}
