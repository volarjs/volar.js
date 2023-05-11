import type { ExportsInfoForLabs } from '@volar/vscode';
import * as vscode from 'vscode';

export function useVolarExtensions(
	context: vscode.ExtensionContext,
	addExtension: (extension: vscode.Extension<ExportsInfoForLabs>) => void
) {

	const checked = new Set<string>();

	context.subscriptions.push(
		vscode.extensions.onDidChange(update),
		vscode.window.onDidChangeActiveTextEditor(update),
	);

	update();

	function update() {
		vscode.extensions.all.forEach(extension => {

			if (checked.has(extension.id)) return;
			if (!extension.isActive) return;

			checked.add(extension.id);

			if (!extension.exports?.volar) return;

			addExtension(extension);
		});
	}
}

export function getIconPath(extension: vscode.Extension<any>) {
	return vscode.Uri.joinPath(extension.extensionUri, extension.packageJSON.icon);
}
