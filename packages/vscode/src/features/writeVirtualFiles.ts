import * as vscode from 'vscode';
import type { BaseLanguageClient } from 'vscode-languageclient';
import { WriteVirtualFilesNotification } from '@volar/language-server';

export async function activate(cmd: string, client: BaseLanguageClient) {
	return vscode.commands.registerCommand(cmd, () => {
		if (vscode.window.activeTextEditor) {
			client.sendNotification(WriteVirtualFilesNotification.type, client.code2ProtocolConverter.asTextDocumentIdentifier(vscode.window.activeTextEditor.document));
		}
	});
}
