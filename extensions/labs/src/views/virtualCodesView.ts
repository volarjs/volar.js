import type { GetVirtualFileRequest, UpdateVirtualCodeStateNotification } from '@volar/language-server';
import type { BaseLanguageClient, LabsInfo } from '@volar/vscode';
import * as vscode from 'vscode';
import { useVolarExtensions } from '../common/shared';
import {
	activate as activateShowVirtualFiles,
	sourceDocUriToVirtualDocUris,
	virtualDocUriToSourceDocUri,
} from '../common/showVirtualFile';
import { isValidVersion } from './serversView';

export const VOLAR_VIRTUAL_CODE_SCHEME = 'volar_virtual_code';

interface VirtualFileItem {
	extension: vscode.Extension<LabsInfo>;
	client: BaseLanguageClient;
	sourceDocumentUri: string;
	generated: NonNullable<GetVirtualFileRequest.ResponseType>;
	isRoot: boolean;
}

export const uriToVirtualCode = new Map<string, { fileUri: string; virtualCodeId: string }>();

export function activate(context: vscode.ExtensionContext) {
	let currentDocument: vscode.TextDocument | undefined;

	const languageIdToFileExtension = new Map<string, string>();

	for (const extension of vscode.extensions.all) {
		try {
			const packageJSON = extension.packageJSON;
			if (packageJSON.contributes?.languages) {
				for (const language of packageJSON.contributes.languages) {
					if (language.id && language.extensions) {
						for (const extension of language.extensions) {
							languageIdToFileExtension.set(language.id, extension);
							break;
						}
					}
				}
			}
		}
		catch {}
	}

	const extensions: vscode.Extension<LabsInfo>[] = [];
	const onDidChangeTreeData = new vscode.EventEmitter<void>();
	const tree: vscode.TreeDataProvider<VirtualFileItem> = {
		onDidChangeTreeData: onDidChangeTreeData.event,
		async getChildren(element) {
			if (!currentDocument) {
				return [];
			}
			if (!element) {
				const items: VirtualFileItem[] = [];
				for (const extension of extensions) {
					for (const client of extension.exports.volarLabs.languageClients) {
						if (
							!client.clientOptions.documentSelector
							|| !vscode.languages.match(client.clientOptions.documentSelector, currentDocument)
						) {
							continue;
						}
						const virtualFile = await client.sendRequest(
							extension.exports.volarLabs.languageServerProtocol.GetVirtualFileRequest.type,
							{
								uri: currentDocument.uri.toString(),
							} satisfies GetVirtualFileRequest.ParamsType,
						);
						if (virtualFile) {
							items.push({
								extension,
								client,
								generated: virtualFile,
								sourceDocumentUri: currentDocument.uri.toString(),
								isRoot: true,
							});
						}
					}
				}
				return items;
			}
			else {
				return element.generated.embeddedCodes.map(code => ({
					...element,
					generated: code,
					sourceDocumentUri: currentDocument!.uri.toString(),
					isRoot: false,
				}));
			}
		},
		getTreeItem(element) {
			const ext = languageIdToFileExtension.get(element.generated.languageId) ?? '.' + element.generated.languageId;
			const uri = vscode.Uri.from({
				scheme: VOLAR_VIRTUAL_CODE_SCHEME,
				// @ts-expect-error
				authority: element.client._id.toLowerCase(),
				path: '/' + element.generated.virtualCodeId + ext,
				fragment: encodeURIComponent(element.sourceDocumentUri),
			});
			virtualDocUriToSourceDocUri.set(uri.toString(), {
				fileUri: element.sourceDocumentUri,
				virtualCodeId: element.generated.virtualCodeId,
			});

			const virtualFileUris = sourceDocUriToVirtualDocUris.get(element.sourceDocumentUri) ?? new Set<string>();
			virtualFileUris.add(uri.toString());
			sourceDocUriToVirtualDocUris.set(element.sourceDocumentUri, virtualFileUris);

			let description = '';
			description += `version: ${element.generated.version}`;
			if (element.isRoot) {
				description += ` (${element.client.name})`;
			}
			return {
				checkboxState: element.generated.disabled
					? vscode.TreeItemCheckboxState.Unchecked
					: vscode.TreeItemCheckboxState.Checked,
				iconPath: new vscode.ThemeIcon('file'),
				label: element.generated.virtualCodeId,
				description,
				collapsibleState: element.generated.embeddedCodes.length
					? vscode.TreeItemCollapsibleState.Expanded
					: vscode.TreeItemCollapsibleState.None,
				resourceUri: uri,
				command: {
					command: '_volar.action.openVirtualFile',
					title: '',
					arguments: [uri],
				},
			};
		},
	};
	const treeView = vscode.window.createTreeView('volar-virtual-codes', {
		treeDataProvider: tree,
		showCollapseAll: false,
		manageCheckboxStateManually: true,
	});

	context.subscriptions.push(
		vscode.commands.registerCommand('_volar.action.openVirtualFile', (uri: vscode.Uri) => {
			vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Two, preview: false });
		}),
		vscode.window.onDidChangeActiveTextEditor(tryUpdateTreeView),
		vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document === currentDocument) {
				tryUpdateTreeView();
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
					} satisfies UpdateVirtualCodeStateNotification.ParamsType,
				);
			}
		}),
		activateShowVirtualFiles(extensions),
	);

	useVolarExtensions(
		context,
		extension => {
			const { version } = extension.exports.volarLabs;
			if (isValidVersion(version)) {
				for (const languageClient of extension.exports.volarLabs.languageClients) {
					context.subscriptions.push(
						languageClient.onDidChangeState(tryUpdateTreeView),
					);
				}
				extension.exports.volarLabs.onDidAddLanguageClient(languageClient => {
					context.subscriptions.push(
						languageClient.onDidChangeState(tryUpdateTreeView),
					);
					tryUpdateTreeView();
				});
				extensions.push(extension);
				tryUpdateTreeView();
			}
		},
	);

	function tryUpdateTreeView() {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}
		const isVirtualFile = editor.document.uri.scheme === VOLAR_VIRTUAL_CODE_SCHEME;
		if (!isVirtualFile) {
			currentDocument = editor.document;
			onDidChangeTreeData.fire();
		}
		else if (currentDocument) {
			onDidChangeTreeData.fire();
		}
	}
}
