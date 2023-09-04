import { type ExportsInfoForLabs, supportLabsVersion } from '@volar/vscode';
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
			if (!checked.has(extension.id) && extension.isActive) {

				checked.add(extension.id);

				if (extension.exports && 'volarLabs' in extension.exports) {

					const info: ExportsInfoForLabs = extension.exports;
					if (info.volarLabs.version !== supportLabsVersion) {
						vscode.window.showWarningMessage(`Extension '${extension.id}' is not compatible with this Labs version. Expected version ${supportLabsVersion}, but got ${info.volarLabs.version}. Please downgrade Labs or update '${extension.id}' if available.`);
						return;
					}

					addExtension(extension);
				}
			}
		});
	}
}

export function getIconPath(extension: vscode.Extension<any>) {
	return vscode.Uri.joinPath(extension.extensionUri, extension.packageJSON.icon);
}
