import { LoadedTSFilesMetaRequest } from '@volar/language-server/protocol';
import type { LabsInfo } from '@volar/vscode';
import * as lsp from '@volar/vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { quickPick } from '../common/quickPick';
import { getIconPath, useVolarExtensions } from '../common/shared';

interface LanguageClientItem {
	extension: vscode.Extension<LabsInfo>;
	client: lsp.BaseLanguageClient;
}

interface InvalidLanguageClientItem {
	extension: vscode.Extension<LabsInfo>;
}

interface LanguageClientFieldItem extends LanguageClientItem {
	field: 'start' | 'stop' | 'restart' | 'enableCodegenStack' | 'disableCodegenStack' | 'initializationOptions' | 'initializeResult' | 'memory';
}

export function activate(context: vscode.ExtensionContext) {

	const extensions: vscode.Extension<LabsInfo>[] = [];
	const invalidExtensions: vscode.Extension<LabsInfo>[] = [];
	const onDidChangeTreeData = new vscode.EventEmitter<void>();
	const tree: vscode.TreeDataProvider<LanguageClientItem | InvalidLanguageClientItem | LanguageClientFieldItem> = {
		onDidChangeTreeData: onDidChangeTreeData.event,
		async getChildren(element) {
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
					if (element.extension.exports.volarLabs.codegenStackSupport) {
						element.client.clientOptions.initializationOptions ??= {};
						if (element.client.clientOptions.initializationOptions.codegenStack) {
							stats.push({ ...element, field: 'disableCodegenStack' });
						}
						else {
							stats.push({ ...element, field: 'enableCodegenStack' });
						}
					}
					stats.push({ ...element, field: 'initializationOptions' });
					stats.push({ ...element, field: 'initializeResult' });
					stats.push({ ...element, field: 'memory' });
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
				else if (element.field === 'memory') {
					return {
						label: 'TS Memory Treemap',
						collapsibleState: vscode.TreeItemCollapsibleState.None,
						command: {
							command: '_volar.action.tsMemoryTreemap',
							title: '',
							arguments: [element.client],
						},
					};
				}
				else if (element.field === 'enableCodegenStack') {
					return {
						iconPath: new vscode.ThemeIcon('primitive-dot'),
						label: 'Enable Codegen Stack',
						collapsibleState: vscode.TreeItemCollapsibleState.None,
						command: {
							command: '_volar.action.enableCodegenStack',
							title: '',
							arguments: [element.client],
						},
					};
				}
				else if (element.field === 'disableCodegenStack') {
					return {
						iconPath: new vscode.ThemeIcon('debug-breakpoint'),
						label: 'Disable Codegen Stack',
						collapsibleState: vscode.TreeItemCollapsibleState.None,
						command: {
							command: '_volar.action.disableCodegenStack',
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
			return {
				iconPath: new vscode.ThemeIcon('error'),
				label: element.extension.packageJSON.displayName,
				collapsibleState: vscode.TreeItemCollapsibleState.None,
				description: `This extension is not compatible with the current version of Volar Labs (volarLabs.version != ${JSON.stringify(lsp.currentLabsVersion)}).`,
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
		vscode.commands.registerCommand('_volar.action.tsMemoryTreemap', async (client: lsp.BaseLanguageClient) => {

			const select = await quickPick([
				{
					openInBrowser: {
						label: 'Open in Browser',
						description: 'Open the TypeScript Memory Treemap in your browser',
					},
					showInVSCode: {
						label: 'Show in VS Code',
						description: 'Show the html file in VS Code',
					},
					saveFile: {
						label: 'Save File',
						description: 'Pick a location to save the html file',
					},
				}
			]);

			if (select === undefined) {
				return; // cancel
			}

			vscode.window.withProgress({
				location: vscode.ProgressLocation.Window,
				cancellable: false,
				title: 'Loading Memory Data'
			}, async (progress) => {

				progress.report({ increment: 0 });

				const meta = await client.sendRequest(LoadedTSFilesMetaRequest.type);
				const { visualizer } = await import('esbuild-visualizer/dist/plugin/index.js');
				const fileContent = await visualizer(meta as any);

				if (select === 'openInBrowser') {
					const tmpPath = path.join(os.tmpdir(), 'memory-report.html');
					fs.writeFileSync(tmpPath, fileContent);
					await vscode.env.openExternal(vscode.Uri.file(tmpPath));
				}
				else if (select === 'showInVSCode') {
					const doc = await vscode.workspace.openTextDocument({ content: fileContent, language: 'html' });
					vscode.window.showTextDocument(doc);
				}
				else if (select === 'saveFile') {
					const workspaces = vscode.workspace.workspaceFolders;
					if (!workspaces?.length) {
						return;
					}

					const defaultUri = vscode.Uri.joinPath(workspaces[0].uri, 'stats.html');
					const pickedUri = await vscode.window.showSaveDialog({ defaultUri });

					if (!pickedUri) {
						return;
					}

					await vscode.workspace.fs.writeFile(pickedUri, Buffer.from(fileContent));
					await vscode.window.showTextDocument(pickedUri);
				}

				progress.report({ increment: 100 });
			});
		}),
		vscode.commands.registerCommand('_volar.action.enableCodegenStack', async (client: lsp.BaseLanguageClient) => {
			client.clientOptions.initializationOptions.codegenStack = true;
			await client.stop();
			await client.start();
		}),
		vscode.commands.registerCommand('_volar.action.disableCodegenStack', async (client: lsp.BaseLanguageClient) => {
			client.clientOptions.initializationOptions.codegenStack = false;
			await client.stop();
			await client.start();
		}),
		vscode.commands.registerCommand('volar.action.serverStat.initializationOptions', async (client: lsp.BaseLanguageClient) => {
			const doc = await vscode.workspace.openTextDocument({ content: JSON.stringify(client.clientOptions.initializationOptions, undefined, '\t'), language: 'json' });
			vscode.window.showTextDocument(doc);
		}),
		vscode.commands.registerCommand('volar.action.serverStat.initializeResult', async (client: lsp.BaseLanguageClient) => {
			const doc = await vscode.workspace.openTextDocument({ content: JSON.stringify(client.initializeResult, undefined, '\t'), language: 'json' });
			vscode.window.showTextDocument(doc);
		}),
		vscode.window.createTreeView('volar-servers', {
			showCollapseAll: false,
			treeDataProvider: tree,
		}),
	);

	useVolarExtensions(
		context,
		extension => {
			const { version } = extension.exports.volarLabs;
			if (version === lsp.currentLabsVersion) {
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
			}
			else {
				invalidExtensions.push(extension);
				onDidChangeTreeData.fire();
			}
		},
	);
}
