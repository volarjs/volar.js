import type { GetVirtualFilesRequest, UpdateVirtualFileStateNotification } from '@volar/language-server';
import { currentLabsVersion, type BaseLanguageClient, type LabsInfo } from '@volar/vscode';
import * as path from 'path';
import * as vscode from 'vscode';
import { useVolarExtensions } from '../common/shared';
import { activate as activateShowVirtualFiles, sourceUriToVirtualUris, virtualUriToSourceUri } from '../common/showVirtualFile';

interface VirtualFileItem {
	extension: vscode.Extension<LabsInfo>;
	client: BaseLanguageClient;
	sourceDocumentUri: string;
	virtualFile: NonNullable<GetVirtualFilesRequest.ResponseType>;
	isRoot: boolean;
}

export function activate(context: vscode.ExtensionContext) {

	const extensions: vscode.Extension<LabsInfo>[] = [];
	const onDidChangeTreeData = new vscode.EventEmitter<void>();
	const tree: vscode.TreeDataProvider<VirtualFileItem> = {
		onDidChangeTreeData: onDidChangeTreeData.event,
		async getChildren(element) {

			const doc = vscode.window.activeTextEditor?.document;
			if (!doc) {
				return [];
			}

			if (!element) {
				const items: VirtualFileItem[] = [];
				for (const extension of extensions) {
					for (const client of extension.exports.volarLabs.languageClients) {
						const virtualFile = await client.sendRequest(extension.exports.volarLabs.languageServerProtocol.GetVirtualFilesRequest.type, { uri: doc.uri.toString() });
						if (virtualFile) {
							items.push({
								extension,
								client,
								virtualFile,
								sourceDocumentUri: doc.uri.toString(),
								isRoot: true,
							});
						}
					}
				}
				return items;
			}
			else if ('virtualFile' in element) {
				return element.virtualFile.embeddedFiles.map((file => ({
					...element,
					virtualFile: file,
					sourceDocumentUri: doc.uri.toString(),
					isRoot: false,
				})));
			}
		},
		getTreeItem(element) {
			const uri = getVirtualFileUri(element.virtualFile.fileName, element.client.name);
			virtualUriToSourceUri.set(uri.toString(), element.sourceDocumentUri);

			const virtualFileUris = sourceUriToVirtualUris.get(element.sourceDocumentUri) ?? new Set<string>();
			virtualFileUris.add(uri.toString());
			sourceUriToVirtualUris.set(element.sourceDocumentUri, virtualFileUris);

			let label = path.basename(element.virtualFile.fileName);
			let description = '';
			if (element.virtualFile.tsScriptKind !== undefined) {
				description += `tsScriptKind: ${element.virtualFile.tsScriptKind}, `;
			}
			description += `version: ${element.virtualFile.version}`;
			if (element.isRoot) {
				description += ` (${element.client.name})`;
			}
			return {
				checkboxState: element.virtualFile.disabled ? vscode.TreeItemCheckboxState.Unchecked : vscode.TreeItemCheckboxState.Checked,
				iconPath: element.client.clientOptions.initializationOptions.codegenStack ? new vscode.ThemeIcon('debug-breakpoint') : new vscode.ThemeIcon('file'),
				label,
				description,
				collapsibleState: element.virtualFile.embeddedFiles.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
				resourceUri: uri,
				command: {
					command: '_volar.action.openVirtualFile',
					title: '',
					arguments: [uri],
				},
			};
		},
	};
	const treeView = vscode.window.createTreeView('volar-virtual-files', {
		treeDataProvider: tree,
		showCollapseAll: false,
		manageCheckboxStateManually: true,
	});

	context.subscriptions.push(
		vscode.commands.registerCommand('_volar.action.openVirtualFile', async (uri: vscode.Uri) => {
			vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Two, preview: false });
		}),
		vscode.window.onDidChangeActiveTextEditor((e) => {

			if (!e) {
				return;
			}

			const document = e.document;
			const isVirtualFile = extensions
				.some(extension => extension.exports.volarLabs.languageClients.some(
					client => client.name
						.replace(/ /g, '_')
						.toLowerCase() === document.uri.scheme
				));
			if (isVirtualFile) {
				return;
			}

			onDidChangeTreeData.fire();
		}),
		vscode.workspace.onDidChangeTextDocument(() => {
			onDidChangeTreeData.fire();
		}),
		treeView,
		treeView.onDidChangeCheckboxState(e => {
			for (const [item, state] of e.items) {
				if ('virtualFile' in item) {
					item.virtualFile.disabled = state === vscode.TreeItemCheckboxState.Unchecked;
					item.client.sendNotification(
						item.extension.exports.volarLabs.languageServerProtocol.UpdateVirtualFileStateNotification.type,
						{
							uri: item.sourceDocumentUri,
							virtualFileName: item.virtualFile.fileName,
							disabled: state === vscode.TreeItemCheckboxState.Unchecked,
						} satisfies UpdateVirtualFileStateNotification.ParamsType
					);
				}
			}
		}),
	);

	useVolarExtensions(
		context,
		extension => {
			const { version } = extension.exports.volarLabs;
			if (version === currentLabsVersion) {
				for (const languageClient of extension.exports.volarLabs.languageClients) {
					context.subscriptions.push(
						languageClient.onDidChangeState(() => onDidChangeTreeData.fire())
					);
				}
				extension.exports.volarLabs.onDidAddLanguageClient(languageClient => {
					context.subscriptions.push(
						languageClient.onDidChangeState(() => onDidChangeTreeData.fire())
					);
					onDidChangeTreeData.fire();
				});
				extensions.push(extension);
				onDidChangeTreeData.fire();
				activateShowVirtualFiles(extension.exports);
			}
		}
	);
}

function getVirtualFileUri(fileName: string, clientName: string) {
	return vscode.Uri
		.file(fileName)
		.with({ scheme: clientName.replace(/ /g, '_').toLowerCase() });
}
