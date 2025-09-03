import * as vscode from 'vscode';
import type { BaseLanguageClient } from 'vscode-languageclient';
import { ReloadProjectNotification } from '../../protocol.js';

export function activate(cmd: string, client: BaseLanguageClient) {
	return vscode.commands.registerCommand(cmd, () => {
		if (vscode.window.activeTextEditor) {
			client.sendNotification(
				ReloadProjectNotification.type,
				client.code2ProtocolConverter.asTextDocumentIdentifier(vscode.window.activeTextEditor.document),
			);
		}
	});
}
