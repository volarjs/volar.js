import type { ExportsInfoForLabs } from '@volar/vscode';
import * as path from 'path';
import * as vscode from 'vscode';
import * as lsp from '@volar/vscode';
import { getIconPath, useVolarExtensions } from '../common/shared';
import type { GetVirtualFilesRequest } from '@volar/language-server';
import { sourceUriToVirtualUris, virtualUriToSourceUri, activate as activateShowVirtualFiles } from '../common/showVirtualFile';

interface LanguageClientItem {
	extension: vscode.Extension<ExportsInfoForLabs>;
	iconPath: vscode.Uri;
	client: lsp.BaseLanguageClient;
}

interface VirtualFileItem extends LanguageClientItem {
	sourceDocumentUri: string;
	virtualFile: NonNullable<GetVirtualFilesRequest.ResponseType>;
}

export function activate(context: vscode.ExtensionContext) {

	const extensions: vscode.Extension<ExportsInfoForLabs>[] = [];
	const onDidChangeTreeData = new vscode.EventEmitter<void>();
	const tree: vscode.TreeDataProvider<LanguageClientItem | VirtualFileItem> = {
		onDidChangeTreeData: onDidChangeTreeData.event,
		async getChildren(element) {

			if (!element) {
				return extensions.map(extension => extension.exports.volarLabs.languageClients.map(client => ({ extension, iconPath: vscode.Uri.joinPath(extension.extensionUri, extension.packageJSON.icon), client }))).flat();
			}

			const doc = vscode.window.activeTextEditor?.document;
			if (!doc) return;

			if ('virtualFile' in element) {
				return element.virtualFile.embeddedFiles.map((file => ({
					...element,
					virtualFile: file,
					sourceDocumentUri: doc.uri.toString(),
				})));
			}
			else {
				const virtualFile = await element.client.sendRequest(element.extension.exports.volarLabs.languageServerProtocol.GetVirtualFilesRequest.type, { uri: doc.uri.toString() });
				if (virtualFile) {
					return [{
						...element,
						virtualFile,
						sourceDocumentUri: doc.uri.toString(),
					}];
				}
			}
		},
		getTreeItem(element) {
			if ('virtualFile' in element) {

				const uri = vscode.Uri.parse(element.virtualFile.id).with({ scheme: element.client.name.replace(/ /g, '_').toLowerCase() });
				virtualUriToSourceUri.set(uri.toString(), element.sourceDocumentUri);

				const virtualFileUris = sourceUriToVirtualUris.get(element.sourceDocumentUri) ?? new Set<string>();
				virtualFileUris.add(uri.toString());
				sourceUriToVirtualUris.set(element.sourceDocumentUri, virtualFileUris);

				let label = path.basename(element.virtualFile.id);
				// @ts-expect-error
				const version = element.virtualFile.version;
				label += ` (ts: ${element.virtualFile.typescript?.isLanguageServiceSourceFile}, version: ${version})`;
				return {
					iconPath: element.client.clientOptions.initializationOptions.codegenStack ? new vscode.ThemeIcon('debug-breakpoint') : new vscode.ThemeIcon('file'),
					label,
					collapsibleState: element.virtualFile.embeddedFiles.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
					resourceUri: vscode.Uri.parse(element.virtualFile.id),
					command: {
						command: '_volar.action.openVirtualFile',
						title: '',
						arguments: [vscode.Uri.parse(element.virtualFile.id).with({ scheme: element.client.name.replace(/ /g, '_').toLowerCase() })],
					},
				};
			}
			else {
				return {
					iconPath: getIconPath(element.extension),
					label: element.client.name,
					collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
				};
			}
		},
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('_volar.action.openVirtualFile', async (uri: vscode.Uri) => {
			vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Two, preview: false });
		}),
		vscode.window.onDidChangeActiveTextEditor((e) => {

			if (!e) return;

			const document = e.document;
			const isVirtualFile = extensions
				.some(extension => extension.exports.volarLabs.languageClients
					.some(client => client.name.replace(/ /g, '_').toLowerCase() === document.uri.scheme)
				);
			if (isVirtualFile) return;

			onDidChangeTreeData.fire();
		}),
		vscode.workspace.onDidChangeTextDocument(() => {
			onDidChangeTreeData.fire();
		}),
		vscode.window.createTreeView('volar-virtual-files', {
			showCollapseAll: false,
			treeDataProvider: tree,
		}),
	);

	useVolarExtensions(
		context,
		extension => {
			for (const client of extension.exports.volarLabs.languageClients) {
				context.subscriptions.push(
					client.onDidChangeState(() => onDidChangeTreeData.fire())
				);
			}
			extensions.push(extension);
			onDidChangeTreeData.fire();
			activateShowVirtualFiles(extension.exports);
		}
	);
}
