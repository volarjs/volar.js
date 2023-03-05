import * as vscode from 'vscode';
import type { BaseLanguageClient } from 'vscode-languageclient';
import { ReportStats } from '@volar/language-server';

export async function activate(cmd: string, clients: BaseLanguageClient[]) {
	return vscode.commands.registerCommand(cmd, async () => {
		for (const client of clients) {
			await client.sendNotification(ReportStats.type);
			client.outputChannel.show();
		}
	});
}
