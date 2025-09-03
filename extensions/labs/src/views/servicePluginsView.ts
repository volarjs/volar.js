import type { GetServicePluginsRequest, UpdateServicePluginStateNotification } from '@volar/language-server';
import type { BaseLanguageClient, LabsInfo } from '@volar/vscode';
import * as vscode from 'vscode';
import { getIconPath, useVolarExtensions } from '../common/shared';
import { isValidVersion } from './serversView';
import { VOLAR_VIRTUAL_CODE_SCHEME } from './virtualCodesView';

interface ServicePluginItem {
	extension: vscode.Extension<LabsInfo>;
	client: BaseLanguageClient;
	sourceDocumentUri: string;
	servicePlugin: NonNullable<NonNullable<GetServicePluginsRequest.ResponseType>[number]>;
}

export function activate(context: vscode.ExtensionContext) {
	const extensions: vscode.Extension<LabsInfo>[] = [];
	const onDidChangeTreeData = new vscode.EventEmitter<void>();
	const tree: vscode.TreeDataProvider<ServicePluginItem> = {
		onDidChangeTreeData: onDidChangeTreeData.event,
		async getChildren(element) {
			const doc = vscode.window.activeTextEditor?.document;
			if (!doc) {
				return [];
			}

			if (!element) {
				const items: ServicePluginItem[] = [];
				for (const extension of extensions) {
					for (const client of extension.exports.volarLabs.languageClients) {
						if (
							!client.clientOptions.documentSelector
							|| !vscode.languages.match(client.clientOptions.documentSelector, doc)
						) {
							continue;
						}
						const servicePlugins = await client.sendRequest(
							extension.exports.volarLabs.languageServerProtocol.GetServicePluginsRequest.type,
							{ uri: doc.uri.toString() },
						);
						if (servicePlugins) {
							for (const servicePlugin of servicePlugins) {
								items.push({
									extension,
									client,
									servicePlugin,
									sourceDocumentUri: doc.uri.toString(),
								});
							}
						}
					}
				}
				return items;
			}
		},
		getTreeItem(element) {
			return {
				checkboxState: element.servicePlugin.disabled
					? vscode.TreeItemCheckboxState.Unchecked
					: vscode.TreeItemCheckboxState.Checked,
				iconPath: getIconPath(element.extension),
				label: element.servicePlugin.name ?? `[${element.servicePlugin.id}]`,
				description: element.servicePlugin.features.join(', '),
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			};
		},
	};
	const treeView = vscode.window.createTreeView('volar-services', {
		treeDataProvider: tree,
		showCollapseAll: false,
		manageCheckboxStateManually: true,
	});

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (!editor) {
				return;
			}

			const isVirtualFile = editor.document.uri.scheme === VOLAR_VIRTUAL_CODE_SCHEME;
			if (isVirtualFile) {
				return;
			}

			onDidChangeTreeData.fire();
		}),
		treeView,
		treeView.onDidChangeCheckboxState(e => {
			for (const [item, state] of e.items) {
				item.servicePlugin.disabled = state === vscode.TreeItemCheckboxState.Unchecked;
				item.client.sendNotification(
					item.extension.exports.volarLabs.languageServerProtocol.UpdateServicePluginStateNotification.type,
					{
						uri: item.sourceDocumentUri,
						serviceId: item.servicePlugin.id,
						disabled: state === vscode.TreeItemCheckboxState.Unchecked,
					} satisfies UpdateServicePluginStateNotification.ParamsType,
				);
			}
		}),
	);

	useVolarExtensions(
		context,
		extension => {
			const { version } = extension.exports.volarLabs;
			if (isValidVersion(version)) {
				for (const languageClient of extension.exports.volarLabs.languageClients) {
					context.subscriptions.push(
						languageClient.onDidChangeState(() => onDidChangeTreeData.fire()),
					);
				}
				extension.exports.volarLabs.onDidAddLanguageClient(languageClient => {
					context.subscriptions.push(
						languageClient.onDidChangeState(() => onDidChangeTreeData.fire()),
					);
					onDidChangeTreeData.fire();
				});
				extensions.push(extension);
				onDidChangeTreeData.fire();
			}
		},
	);
}
