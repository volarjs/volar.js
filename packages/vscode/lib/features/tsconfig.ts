import * as path from 'path-browserify';
import * as vscode from 'vscode';
import type { BaseLanguageClient } from 'vscode-languageclient';
import { GetMatchTsConfigRequest } from '../../protocol.js';

export function activate(
	selector: vscode.DocumentSelector,
	cmd: string,
	client: BaseLanguageClient,
) {
	const subscriptions: vscode.Disposable[] = [];
	const statusBar = vscode.languages.createLanguageStatusItem(cmd, selector);

	let currentTsconfigUri: vscode.Uri | undefined;
	let updateStatus: ReturnType<typeof setTimeout> | undefined;

	updateStatusBar();

	vscode.window.onDidChangeActiveTextEditor(
		() => {
			clearTimeout(updateStatus);
			updateStatus = setTimeout(() => updateStatusBar, 100);
		},
		undefined,
		subscriptions,
	);

	subscriptions.push(vscode.commands.registerCommand(cmd, async () => {
		if (currentTsconfigUri) {
			const document = await vscode.workspace.openTextDocument(currentTsconfigUri);
			await vscode.window.showTextDocument(document);
		}
	}));

	subscriptions.push(...subscriptions);

	async function updateStatusBar() {
		if (
			!vscode.window.activeTextEditor
			|| !vscode.languages.match(selector, vscode.window.activeTextEditor.document)
		) {
			return;
		}
		const tsconfig = await client.sendRequest(
			GetMatchTsConfigRequest.type,
			client.code2ProtocolConverter.asTextDocumentIdentifier(vscode.window.activeTextEditor.document),
		);
		if (tsconfig?.uri) {
			currentTsconfigUri = vscode.Uri.parse(tsconfig.uri);
			statusBar.text = path.relative(
				vscode.workspace.rootPath?.replace(/\\/g, '/') || '/',
				currentTsconfigUri.fsPath.replace(/\\/g, '/'),
			);
			statusBar.command = {
				title: 'Open config file',
				command: cmd,
			};
		}
		else {
			statusBar.text = 'No tsconfig';
			statusBar.command = undefined;
		}
	}
}
