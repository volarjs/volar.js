import * as vscode from 'vscode';

export { activate as activateAutoInsertion } from './features/autoInsertion';
export { activate as activateShowVirtualFiles } from './features/showVirtualFiles';
export { activate as activateWriteVirtualFiles } from './features/writeVirtualFiles';
export { activate as activateFindFileReferences } from './features/fileReferences';
export { activate as activateReloadProjects } from './features/reloadProject';
export { activate as activateServerStats } from './features/serverStatus';
export { activate as activateTsConfigStatusItem } from './features/tsconfig';
export { activate as activateServerSys } from './features/serverSys';
export { activate as activateTsVersionStatusItem, getTsdk } from './features/tsVersion';

export function takeOverModeActive(context: vscode.ExtensionContext) {
	if (vscode.workspace.getConfiguration('volar').get<string>('takeOverMode.extension') === context.extension.id) {
		return !vscode.extensions.getExtension('vscode.typescript-language-features');
	}
	return false;
}

import * as lsp from 'vscode-languageclient';

export const middleware: lsp.Middleware = {
	async provideCodeActions(document, range, context, token, next) {
		let actions = await next(document, range, context, token);
		actions = actions?.map(action => {
			if (!(action instanceof vscode.CodeAction)) {
				return parseServerCommand(action);
			}
			if (action.command) {
				action.command = parseServerCommand(action.command);
			}
			if (action.edit) {
				normalizeCodeActionEdit(document, action);
			}
			return action;
		});
		return actions;
	},
	async resolveCodeAction(item, token, next) {
		const action = await next(item, token);
		if (action?.command) {
			action.command = parseServerCommand(action.command);
		}
		return action;
	},
	async provideCodeLenses(document, token, next) {
		let codeLenses = await next(document, token);
		codeLenses = codeLenses?.map(action => {
			if (action.command) {
				action.command = parseServerCommand(action.command);
			}
			return action;
		});
		return codeLenses;
	},
	async resolveCodeLens(item, token, next) {
		const codeLens = await next(item, token);
		if (codeLens?.command) {
			codeLens.command = parseServerCommand(codeLens.command);
		}
		return codeLens;
	},
};

export function parseServerCommand(command: vscode.Command) {
	if (command.command === 'editor.action.rename' && command.arguments) {
		return {
			...command,
			arguments: [[
				vscode.Uri.parse(command.arguments[0]),
				new vscode.Position(command.arguments[1].line, command.arguments[1].character),
			]],
		};
	}
	else if (command.command === 'editor.action.showReferences' && command.arguments) {
		return {
			...command,
			arguments: [
				vscode.Uri.parse(command.arguments[0]),
				new vscode.Position(command.arguments[1].line, command.arguments[1].character),
				command.arguments[2].map((ref: any) => new vscode.Location(
					vscode.Uri.parse(ref.uri),
					new vscode.Range(ref.range.start.line, ref.range.start.character, ref.range.end.line, ref.range.end.character),
				)),
			],
		};
	}
	return command;
}

export const normalizeCodeActionEdit = (document: vscode.TextDocument, action: vscode.CodeAction) => {
	if (!action.edit) return;
	const editor = vscode.window.visibleTextEditors.find(editor => editor.document.fileName === document.fileName);
	if (!editor) return;
	const { options: { insertSpaces, tabSize } } = editor;
	if (!insertSpaces) return;

	const newEdit = new vscode.WorkspaceEdit();
	const renamePos = action.command?.command === 'editor.action.rename' && action.command.arguments![0][1] as vscode.Position;

	for (const [uri, edits] of action.edit.entries()) {
		newEdit.set(uri, edits.map(edit => {
			// #region patch renameLocation for extract symbol actions
			if (edit.newText.startsWith('\t') && renamePos) {
				const endPos = document.positionAt(document.offsetAt(edit.range.start) + edit.newText.length);
				if (new vscode.Range(edit.range.start, endPos).contains(renamePos)) {
					action.command!.arguments![0][1] = renamePos.translate(0,);
				}
			}
			// #endregion
			return new vscode.TextEdit(edit.range, edit.newText.replaceAll('\t', ' '.repeat(tabSize as number)));
		}));
	}
	action.edit = newEdit;
};
