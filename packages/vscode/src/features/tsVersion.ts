import * as path from 'typesafe-path';
import * as vscode from 'vscode';
import { BaseLanguageClient } from 'vscode-languageclient';
import { quickPick } from '../common';
import { LanguageServerInitializationOptions } from '@volar/language-server';

const defaultTsdkPath = 'node_modules/typescript/lib' as path.PosixPath;

export async function activate(
	cmd: string,
	context: vscode.ExtensionContext,
	client: BaseLanguageClient,
	shouldStatusBarShow: (document: vscode.TextDocument) => boolean,
	resolveStatusText: (text: string) => string,
	disableTakeOverMode: boolean,
	cdn = 'https://unpkg.com/',
) {

	const subscriptions: vscode.Disposable[] = [];
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	statusBar.command = cmd;

	subscriptions.push({ dispose: () => statusBar.dispose() });
	subscriptions.push(vscode.commands.registerCommand(cmd, onCommand));

	vscode.workspace.onDidChangeConfiguration(onDidChangeConfiguration, undefined, subscriptions);
	vscode.window.onDidChangeActiveTextEditor(updateStatusBar, undefined, subscriptions);

	updateStatusBar();

	return vscode.Disposable.from(...subscriptions);

	async function onCommand() {

		const tsdk = await getTsdk(context);
		const configTsdkPath = getConfigTsdkPath();
		const vscodeTsdk = await getVScodeTsdk();
		const select = await quickPick([
			{
				useVSCodeTsdk: {
					label: (!tsdk.isWorkspacePath ? '• ' : '') + "Use VS Code's Version",
					description: vscodeTsdk.version,
					detail: vscodeTsdk.isWeb ? vscodeTsdk.path.replace('/node_modules/', cdn) : undefined,
				},
				useConfigWorkspaceTsdk: configTsdkPath && !vscodeTsdk.isWeb ? {
					label: (tsdk.isWorkspacePath ? '• ' : '') + 'Use Workspace Version',
					description: await getTsVersion(resolveWorkspaceTsdk(configTsdkPath) ?? '/') ?? 'Could not load the TypeScript version at this path',
					detail: configTsdkPath,
				} : undefined,
				useDefaultWorkspaceTsdk: configTsdkPath !== defaultTsdkPath && !vscodeTsdk.isWeb ? {
					label: (tsdk.isWorkspacePath ? '• ' : '') + 'Use Workspace Version',
					description: await getTsVersion(resolveWorkspaceTsdk(defaultTsdkPath) ?? '/') ?? 'Could not load the TypeScript version at this path',
					detail: defaultTsdkPath,
				} : undefined,
			},
			...(disableTakeOverMode ? [] : [{
				takeover: {
					label: 'What is Takeover Mode?',
				},
			}])
		]);

		if (select === undefined) {
			return; // cancel
		}
		if (select === 'takeover') {
			vscode.env.openExternal(vscode.Uri.parse('https://vuejs.org/guide/typescript/overview.html#volar-takeover-mode'));
			return;
		}
		if (select === 'useDefaultWorkspaceTsdk') {
			await vscode.workspace.getConfiguration('typescript').update('tsdk', defaultTsdkPath);
		}
		const useWorkspaceTsdk = select === 'useConfigWorkspaceTsdk' || select === 'useDefaultWorkspaceTsdk';
		if (useWorkspaceTsdk !== isUseWorkspaceTsdk(context)) {
			context.workspaceState.update('typescript.useWorkspaceTsdk', useWorkspaceTsdk);
			reloadServers();
		}
		updateStatusBar();
	}

	function onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
		if (e.affectsConfiguration('typescript.tsdk') && isUseWorkspaceTsdk(context)) {
			reloadServers();
		}
	}

	async function updateStatusBar() {
		if (
			!vscode.window.activeTextEditor
			|| !shouldStatusBarShow(vscode.window.activeTextEditor.document)
		) {
			statusBar.hide();
		}
		else {
			const tsVersion = (await getTsdk(context)).version;
			statusBar.text = tsVersion ?? 'x.x.x';
			statusBar.text = resolveStatusText(statusBar.text);
			statusBar.show();
		}
	}

	async function reloadServers() {
		const tsPaths = getTsdk(context);
		const newInitOptions: LanguageServerInitializationOptions = {
			...client.clientOptions.initializationOptions,
			typescript: tsPaths,
		};
		client.clientOptions.initializationOptions = newInitOptions;
		vscode.commands.executeCommand('volar.action.restartServer');
	}
}

export async function getTsdk(context: vscode.ExtensionContext) {
	if (isUseWorkspaceTsdk(context)) {
		const resolvedTsdk = resolveWorkspaceTsdk(getConfigTsdkPath() || defaultTsdkPath);
		if (resolvedTsdk) {
			return {
				tsdk: resolvedTsdk,
				version: await getTsVersion(resolvedTsdk),
				isWorkspacePath: true,
			};
		}
	}
	const tsdk = await getVScodeTsdk();
	return {
		tsdk: tsdk.path,
		version: tsdk.version,
		isWorkspacePath: false,
	};
}

function resolveWorkspaceTsdk(tsdk: path.OsPath | path.PosixPath) {
	if (path.isAbsolute(tsdk)) {
		try {
			if (require.resolve('./typescript.js', { paths: [tsdk] })) {
				return tsdk;
			}
		} catch { }
	}
	const workspaceFolderFsPaths = (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath as path.OsPath);
	for (const folder of workspaceFolderFsPaths) {
		const _path = path.join(folder, tsdk);
		try {
			if (require.resolve('./typescript.js', { paths: [_path] })) {
				return _path;
			}
		} catch { }
	}
}

async function getVScodeTsdk() {

	const nightly = vscode.extensions.getExtension('ms-vscode.vscode-typescript-next');
	if (nightly) {
		const path = nightly.extensionPath.toString() + '/node_modules/typescript/lib';
		return {
			path,
			version: await getTsVersion(path),
			isWeb: false,
		};
	}

	if (vscode.env.appRoot) {
		const libPath = path.join(
			vscode.env.appRoot as path.OsPath,
			'extensions/node_modules/typescript/lib' as path.PosixPath,
		);
		return {
			path: libPath,
			version: await getTsVersion(libPath),
			isWeb: false,
		};
	}

	// web
	const version: string = require('typescript/package.json').version;
	return {
		path: `/node_modules/typescript@${version}/lib`,
		version,
		isWeb: true,
	};
}

function getConfigTsdkPath() {
	return vscode.workspace.getConfiguration('typescript').get<path.PosixPath>('tsdk');
}

function isUseWorkspaceTsdk(context: vscode.ExtensionContext) {
	return context.workspaceState.get('typescript.useWorkspaceTsdk', false);
}

async function getTsVersion(libPath: string): Promise<string | undefined> {

	const p = libPath.toString().split('/');
	const p2 = p.slice(0, -1);
	const modulePath = p2.join('/');
	const filePath = modulePath + '/package.json';
	const contents = await readFile(filePath);

	if (contents === undefined) {
		return;
	}

	let desc: any = null;
	try {
		desc = JSON.parse(contents);
	} catch (err) {
		return;
	}
	if (!desc || !desc.version) {
		return;
	}

	return desc.version;
}

async function readFile(path: string) {
	try {
		const data = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
		return new TextDecoder('utf8').decode(data);
	}
	catch { }
}
