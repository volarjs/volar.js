import type { GetVirtualFileRequest, UpdateVirtualCodeStateNotification } from '@volar/language-server';
import type { BaseLanguageClient, LabsInfo } from '@volar/vscode';
import * as vscode from 'vscode';
import { useVolarExtensions } from '../common/shared';
import { activate as activateShowVirtualFiles, sourceUriToVirtualUris, virtualUriToSourceUri } from '../common/showVirtualFile';
import { isValidVersion } from './serversView';

interface VirtualFileItem {
	extension: vscode.Extension<LabsInfo>;
	client: BaseLanguageClient;
	sourceDocumentUri: string;
	generated: NonNullable<GetVirtualFileRequest.ResponseType>;
	isRoot: boolean;
}

export function activate(context: vscode.ExtensionContext) {

	let currentDocument: vscode.TextDocument | undefined;

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
						const virtualFile = await client.sendRequest(
							extension.exports.volarLabs.languageServerProtocol.GetVirtualFileRequest.type,
							{
								uri: doc.uri.toString(),
							} satisfies GetVirtualFileRequest.ParamsType,
						);
						if (virtualFile) {
							items.push({
								extension,
								client,
								generated: virtualFile,
								sourceDocumentUri: doc.uri.toString(),
								isRoot: true,
							});
						}
					}
				}
				if (items.length) {
					currentDocument = doc;
				}
				return items;
			}
			else {
				return element.generated.embeddedCodes.map((code => ({
					...element,
					generated: code,
					sourceDocumentUri: doc.uri.toString(),
					isRoot: false,
				})));
			}
		},
		getTreeItem(element) {
			const uri = getVirtualCodeUri(element.generated.fileUri + '?virtualCodeId=' + element.generated.virtualCodeId, element.client.name);
			virtualUriToSourceUri.set(uri.toString(), {
				fileUri: element.sourceDocumentUri,
				virtualCodeId: element.generated.virtualCodeId,
			});

			const virtualFileUris = sourceUriToVirtualUris.get(element.sourceDocumentUri) ?? new Set<string>();
			virtualFileUris.add(uri.toString());
			sourceUriToVirtualUris.set(element.sourceDocumentUri, virtualFileUris);

			let description = '';
			description += `version: ${element.generated.version}`;
			if (element.isRoot) {
				description += ` (${element.client.name})`;
			}
			return {
				checkboxState: element.generated.disabled ? vscode.TreeItemCheckboxState.Unchecked : vscode.TreeItemCheckboxState.Checked,
				iconPath: element.client.clientOptions.initializationOptions.codegenStack ? new vscode.ThemeIcon('debug-breakpoint') : new vscode.ThemeIcon('file'),
				label: element.generated.virtualCodeId,
				description,
				collapsibleState: element.generated.embeddedCodes.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
				resourceUri: vscode.Uri.parse(
					'file:///a.' + (element.generated.languageId === 'typescript' ? 'ts'
						: element.generated.languageId === 'javascript' ? 'js'
							: element.generated.languageId === 'typescriptreact' ? 'tsx'
								: element.generated.languageId === 'javascriptreact' ? 'jsx'
									: element.generated.languageId === 'jade' ? 'pug'
										: element.generated.languageId === 'markdown' ? 'md'
											: element.generated.languageId === 'glimmer-ts' ? 'gts'
												: element.generated.languageId === 'glimmer-js' ? 'gjs'
													: element.generated.languageId)
				),
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
		vscode.window.onDidChangeActiveTextEditor(e => {

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
		vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document === currentDocument) {
				onDidChangeTreeData.fire();
			}
		}),
		treeView,
		treeView.onDidChangeCheckboxState(e => {
			for (const [item, state] of e.items) {
				item.generated.disabled = state === vscode.TreeItemCheckboxState.Unchecked;
				item.client.sendNotification(
					item.extension.exports.volarLabs.languageServerProtocol.UpdateVirtualCodeStateNotification.type,
					{
						fileUri: item.sourceDocumentUri,
						virtualCodeId: item.generated.virtualCodeId,
						disabled: state === vscode.TreeItemCheckboxState.Unchecked,
					} satisfies UpdateVirtualCodeStateNotification.ParamsType
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

function getVirtualCodeUri(uri: string, clientName: string) {
	return vscode.Uri
		.parse(uri)
		.with({ scheme: clientName.replace(/ /g, '_').toLowerCase() });
}
