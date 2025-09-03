import type { LabsInfo } from '@volar/vscode';
import * as lsp from '@volar/vscode';
import * as vscode from 'vscode';
import { getIconPath, useVolarExtensions } from '../common/shared';

interface LanguageClientItem {
	extension: vscode.Extension<LabsInfo>;
	client: lsp.BaseLanguageClient;
}

interface InvalidLanguageClientItem {
	extension: vscode.Extension<LabsInfo>;
}

interface LanguageClientFieldItem extends LanguageClientItem {
	field: 'start' | 'stop' | 'restart' | 'initializationOptions' | 'initializeResult';
}

export function activate(context: vscode.ExtensionContext) {
	const extensions: vscode.Extension<LabsInfo>[] = [];
	const invalidExtensions: vscode.Extension<LabsInfo>[] = [];
	const onDidChangeTreeData = new vscode.EventEmitter<void>();
	const tree: vscode.TreeDataProvider<LanguageClientItem | InvalidLanguageClientItem | LanguageClientFieldItem> = {
		onDidChangeTreeData: onDidChangeTreeData.event,
		getChildren(element) {
			// root
			if (!element) {
				return [
					...extensions
						.map(extension => {
							return extension.exports.volarLabs.languageClients
								.map(client => {
									return {
										extension,
										client,
									};
								});
						}).flat(),
					...invalidExtensions.map<InvalidLanguageClientItem>(extension => {
						return {
							extension,
						};
					}),
				];
			}
			// child
			if ('client' in element) {
				const stats: LanguageClientFieldItem[] = [];
				if (element.client.state === lsp.State.Running) {
					stats.push({ ...element, field: 'stop' });
					stats.push({ ...element, field: 'restart' });
					stats.push({ ...element, field: 'initializationOptions' });
					stats.push({ ...element, field: 'initializeResult' });
				}
				else if (element.client.state === lsp.State.Starting) {
					stats.push({ ...element, field: 'stop' });
				}
				else {
					stats.push({ ...element, field: 'start' });
				}
				return stats;
			}
			return [];
		},
		getTreeItem(element) {
			if ('field' in element) {
				if (element.field === 'restart') {
					return {
						iconPath: new vscode.ThemeIcon('extensions-refresh'),
						label: 'Restart',
						collapsibleState: vscode.TreeItemCollapsibleState.None,
						command: {
							command: '_volar.action.restartServer',
							title: '',
							arguments: [element.client],
						},
					};
				}
				else if (element.field === 'start') {
					return {
						iconPath: new vscode.ThemeIcon('debug-start'),
						label: 'Start',
						collapsibleState: vscode.TreeItemCollapsibleState.None,
						command: {
							command: '_volar.action.startServer',
							title: '',
							arguments: [element.client],
						},
					};
				}
				else if (element.field === 'stop') {
					return {
						iconPath: new vscode.ThemeIcon('debug-stop'),
						label: element.client.state === lsp.State.Starting ? 'Starting...' : 'Stop',
						collapsibleState: vscode.TreeItemCollapsibleState.None,
						command: {
							command: '_volar.action.stopServer',
							title: '',
							arguments: [element.client],
						},
					};
				}
				else if (element.field === 'initializationOptions') {
					return {
						iconPath: new vscode.ThemeIcon('file'),
						label: 'Initialization Options',
						resourceUri: vscode.Uri.parse('volar:/initializationOptions.json'),
						collapsibleState: vscode.TreeItemCollapsibleState.None,
						command: {
							command: 'volar.action.serverStat.initializationOptions',
							title: '',
							arguments: [element.client],
						},
					};
				}
				else if (element.field === 'initializeResult') {
					return {
						iconPath: new vscode.ThemeIcon('file'),
						label: 'Initialize Result',
						resourceUri: vscode.Uri.parse('volar:/initializeResult.json'),
						collapsibleState: vscode.TreeItemCollapsibleState.None,
						command: {
							command: 'volar.action.serverStat.initializeResult',
							title: '',
							arguments: [element.client],
						},
					};
				}
				else if (element.field === 'projects') {
					return {
						label: 'Projects',
						collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
					};
				}
			}
			else if ('client' in element) {
				return {
					iconPath: getIconPath(element.extension),
					label: element.client.name,
					collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
				};
			}
			const { version } = element.extension.exports.volarLabs;
			return {
				iconPath: new vscode.ThemeIcon('error'),
				label: element.extension.packageJSON.displayName,
				collapsibleState: vscode.TreeItemCollapsibleState.None,
				description: `Extension incompatible: The version is ${JSON.stringify(version)}, required is ${
					JSON.stringify(lsp.currentLabsVersion)
				}.`,
			};
		},
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('_volar.action.startServer', async (client: lsp.BaseLanguageClient) => {
			await client.start();
		}),
		vscode.commands.registerCommand('_volar.action.stopServer', async (client: lsp.BaseLanguageClient) => {
			await client.stop();
		}),
		vscode.commands.registerCommand('_volar.action.restartServer', async (client: lsp.BaseLanguageClient) => {
			await client.stop();
			await client.start();
		}),
		vscode.commands.registerCommand(
			'volar.action.serverStat.initializationOptions',
			async (client: lsp.BaseLanguageClient) => {
				const doc = await vscode.workspace.openTextDocument({
					content: JSON.stringify(client.clientOptions.initializationOptions, undefined, '\t'),
					language: 'json',
				});
				vscode.window.showTextDocument(doc);
			},
		),
		vscode.commands.registerCommand(
			'volar.action.serverStat.initializeResult',
			async (client: lsp.BaseLanguageClient) => {
				const doc = await vscode.workspace.openTextDocument({
					content: JSON.stringify(client.initializeResult, undefined, '\t'),
					language: 'json',
				});
				vscode.window.showTextDocument(doc);
			},
		),
		vscode.window.createTreeView('volar-extensions', {
			showCollapseAll: false,
			treeDataProvider: tree,
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
			else {
				invalidExtensions.push(extension);
				onDidChangeTreeData.fire();
			}
		},
	);
}

export function isValidVersion(version: string | number) {
	return version === lsp.currentLabsVersion;
}
