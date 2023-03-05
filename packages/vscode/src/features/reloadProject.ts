import * as vscode from 'vscode';
import type { BaseLanguageClient } from 'vscode-languageclient';
import { ReloadProjectNotification } from '@volar/language-server';

export async function activate(cmd: string, clients: BaseLanguageClient[]) {
	return vscode.commands.registerCommand(cmd, () => {
		if (vscode.window.activeTextEditor) {
			for (const client of clients) {
				client.sendNotification(ReloadProjectNotification.type, client.code2ProtocolConverter.asTextDocumentIdentifier(vscode.window.activeTextEditor.document));
			}
		}
	});
}
