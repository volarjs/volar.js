import type { Exports } from '@volar/vscode';
import type { GetProjectsRequest, GetVirtualFilesRequest } from '@volar/language-server';
import * as path from 'path';
import * as vscode from 'vscode';
import * as lsp from 'vscode-languageclient';
import { sourceUriToVirtualUris, virtualUriToSourceUri, activate as activateShowVirtualFiles } from './features/showVirtualFile';

export async function activate(context: vscode.ExtensionContext) {

	const checked = new Set<string>();

	vscode.window.onDidChangeActiveTextEditor(checkAll);

	checkAll();

	function checkAll() {

		vscode.extensions.all.forEach(extension => {

			if (checked.has(extension.id)) return;
			if (!extension.isActive) return;

			checked.add(extension.id);

			if (!extension.exports?.volar) return;

			const info: Exports = extension.exports.volar;
			const clients: lsp.BaseLanguageClient[] = info.languageClients;
			const iconPath = vscode.Uri.joinPath(extension.extensionUri, extension.packageJSON.icon);

			activateShowVirtualFiles(info);

			{ // servers

				type ClientPropertyItem = { client: lsp.BaseLanguageClient, stat: 'start' | 'stop' | 'restart' | 'enableCodegenStack' | 'disableCodegenStack' | 'initializationOptions' | 'initializeResult' | 'projects' };
				type ProjectItem = { client: lsp.BaseLanguageClient, project: NonNullable<GetProjectsRequest.ResponseType>[number] };
				type ProjectFileItem = { client: lsp.BaseLanguageClient, project: NonNullable<GetProjectsRequest.ResponseType>[number], file: string };

				const onDidChangeTreeData = new vscode.EventEmitter<void>();
				const serversTree: vscode.TreeDataProvider<lsp.BaseLanguageClient | ClientPropertyItem | ProjectItem | ProjectFileItem> = {
					onDidChangeTreeData: onDidChangeTreeData.event,
					async getChildren(element) {
						if (!element) {
							return clients;
						}
						else if (typeof element === 'string') {
							return [];
						}
						else if ('stat' in element) {
							if (element.stat === 'projects') {
								const projects: GetProjectsRequest.ResponseType = await element.client.sendRequest(info.serverLib.GetProjectsRequest.type, vscode.window.activeTextEditor ? { uri: vscode.window.activeTextEditor.document.uri.toString() } : undefined) ?? [];
								return projects.map(project => ({ client: element.client, project }));
							}
						}
						else if ('project' in element) {
							const fileNames = await element.client.sendRequest(info.serverLib.GetProjectFilesRequest.type, { rootUri: element.project.rootUri, tsconfig: element.project.tsconfig }) ?? [];
							return fileNames.map(fileName => ({ client: element.client, project: element.project, file: fileName }));
						}
						else {
							const stats: ClientPropertyItem[] = [];
							if (element.state === lsp.State.Running) {
								stats.push({ client: element, stat: 'stop' });
								stats.push({ client: element, stat: 'restart' });
								if (info.codegenStackSupport) {
									element.clientOptions.initializationOptions ??= {};
									if (element.clientOptions.initializationOptions.codegenStack) {
										stats.push({ client: element, stat: 'disableCodegenStack' });
									}
									else {
										stats.push({ client: element, stat: 'enableCodegenStack' });
									}
								}
								stats.push({ client: element, stat: 'initializationOptions' });
								stats.push({ client: element, stat: 'initializeResult' });
								stats.push({ client: element, stat: 'projects' });
							}
							else if (element.state === lsp.State.Starting) {
								stats.push({ client: element, stat: 'stop' });
							}
							else {
								stats.push({ client: element, stat: 'start' });
							}
							return stats;
						}
					},
					getTreeItem(element) {
						if ('file' in element) {
							return {
								iconPath: new vscode.ThemeIcon('file'),
								label: path.relative(element.project.rootUri, vscode.Uri.file(element.file).toString()),
								collapsibleState: vscode.TreeItemCollapsibleState.None,
								command: {
									command: 'vscode.open',
									title: '',
									arguments: [vscode.Uri.file(element.file)],
								},
							};
						}
						else if ('stat' in element) {
							if (element.stat === 'restart') {
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
							else if (element.stat === 'start') {
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
							else if (element.stat === 'stop') {
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
							else if (element.stat === 'enableCodegenStack') {
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
							else if (element.stat === 'disableCodegenStack') {
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
							else if (element.stat === 'initializationOptions') {
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
							else if (element.stat === 'initializeResult') {
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
							else if (element.stat === 'projects') {
								return {
									label: `Projects`,
									collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
								};
							}
						}
						else if ('project' in element) {
							let label = '[inferred]';
							if (element.project.tsconfig) {
								label = path.relative(element.project.rootUri, vscode.Uri.file(element.project.tsconfig).toString());
							}
							if (element.project.isSelected) {
								label += ' 👈';
							}
							return {
								iconPath: element.project.created ? new vscode.ThemeIcon('debug-breakpoint-disabled') : new vscode.ThemeIcon('debug-breakpoint-unverified'),
								label,
								collapsibleState: element.project.created ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
							};
						}
						else {
							return {
								iconPath,
								label: element.name,
								collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							};
						}
						throw 'unreachable';
					},
				};

				vscode.commands.registerCommand('_volar.action.startServer', async (client: lsp.BaseLanguageClient) => {
					await client.start();
				});

				vscode.commands.registerCommand('_volar.action.stopServer', async (client: lsp.BaseLanguageClient) => {
					await client.stop();
				});

				vscode.commands.registerCommand('_volar.action.restartServer', async (client: lsp.BaseLanguageClient) => {
					await client.stop();
					await client.start();
				});

				vscode.commands.registerCommand('_volar.action.enableCodegenStack', async (client: lsp.BaseLanguageClient) => {
					client.clientOptions.initializationOptions.codegenStack = true;
					await client.stop();
					await client.start();
				});

				vscode.commands.registerCommand('_volar.action.disableCodegenStack', async (client: lsp.BaseLanguageClient) => {
					client.clientOptions.initializationOptions.codegenStack = false;
					await client.stop();
					await client.start();
				});

				vscode.commands.registerCommand('volar.action.serverStat.initializationOptions', async (client: lsp.BaseLanguageClient) => {
					const doc = await vscode.workspace.openTextDocument({ content: JSON.stringify(client.clientOptions.initializationOptions, undefined, '\t'), language: 'json' });
					vscode.window.showTextDocument(doc);
				});

				vscode.commands.registerCommand('volar.action.serverStat.initializeResult', async (client: lsp.BaseLanguageClient) => {
					const doc = await vscode.workspace.openTextDocument({ content: JSON.stringify(client.initializeResult, undefined, '\t'), language: 'json' });
					vscode.window.showTextDocument(doc);
				});

				vscode.window.onDidChangeActiveTextEditor(() => {
					onDidChangeTreeData.fire();
				});

				for (const client of clients) {
					client.onDidChangeState(() => onDidChangeTreeData.fire());
				}

				context.subscriptions.push(vscode.window.createTreeView('volar-servers', {
					showCollapseAll: false,
					treeDataProvider: serversTree,
				}));
			}

			{ // virtual files

				type VirtualFileItem = { sourceDocumentUri: string, client: lsp.BaseLanguageClient, virtualFile: NonNullable<GetVirtualFilesRequest.ResponseType> };

				const onDidChangeTreeData = new vscode.EventEmitter<void>();
				const virtualFilesTree: vscode.TreeDataProvider<lsp.BaseLanguageClient | VirtualFileItem> = {
					onDidChangeTreeData: onDidChangeTreeData.event,
					async getChildren(element) {

						const doc = vscode.window.activeTextEditor?.document;
						if (!doc) return;

						if (!element) {
							return clients;
						}
						else if ('virtualFile' in element) {
							return element.virtualFile.embeddedFiles.map((file => ({ client: element.client, virtualFile: file, sourceDocumentUri: doc.uri.toString() })));
						}
						else {
							const virtualFile = await element.sendRequest(info.serverLib.GetVirtualFilesRequest.type, { uri: doc.uri.toString() });
							if (virtualFile) {
								return [{ client: element, virtualFile, sourceDocumentUri: doc.uri.toString() }];
							}
						}
					},
					getTreeItem(element) {
						if ('virtualFile' in element) {

							const uri = vscode.Uri.file(element.virtualFile.fileName).with({ scheme: element.client.name.replace(/ /g, '_').toLowerCase() });
							virtualUriToSourceUri.set(uri.toString(), element.sourceDocumentUri);

							const virtualFileUris = sourceUriToVirtualUris.get(element.sourceDocumentUri) ?? new Set<string>();
							virtualFileUris.add(uri.toString());
							sourceUriToVirtualUris.set(element.sourceDocumentUri, virtualFileUris);

							let label = path.basename(element.virtualFile.fileName);
							const version = (element.virtualFile as any).version;
							label += ` (kind: ${element.virtualFile.kind}, version: ${version})`;
							return {
								iconPath: element.client.clientOptions.initializationOptions.codegenStack ? new vscode.ThemeIcon('debug-breakpoint') : new vscode.ThemeIcon('file'),
								label,
								collapsibleState: element.virtualFile.embeddedFiles.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
								resourceUri: vscode.Uri.file(element.virtualFile.fileName),
								command: {
									command: '_volar.action.openVirtualFile',
									title: '',
									arguments: [vscode.Uri.file(element.virtualFile.fileName).with({ scheme: element.client.name.replace(/ /g, '_').toLowerCase() })],
								},
							};
						}
						else {
							return {
								iconPath,
								label: element.name,
								collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							};
						}
					},
				};

				for (const client of clients) {
					client.onDidChangeState(() => onDidChangeTreeData.fire());
				}

				vscode.window.onDidChangeActiveTextEditor((e) => {
					if (!e || clients.some(client => client.name.replace(/ /g, '_').toLowerCase() === e.document.uri.scheme)) // ignore virtual files
						return;
					onDidChangeTreeData.fire();
				});

				vscode.workspace.onDidChangeTextDocument(() => {
					onDidChangeTreeData.fire();
				});

				vscode.commands.registerCommand('_volar.action.openVirtualFile', async (uri: vscode.Uri) => {
					vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Two, preview: false });
				});

				context.subscriptions.push(vscode.window.createTreeView('volar-virtual-files', {
					showCollapseAll: false,
					treeDataProvider: virtualFilesTree,
				}));
			}
		});
	}
}
