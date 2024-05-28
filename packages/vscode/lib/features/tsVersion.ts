import * as path from 'path-browserify';
import * as vscode from 'vscode';
import { quickPick } from '../common';
import * as fs from '../fs';

const defaultTsdkPath = 'node_modules/typescript/lib';

export function activate(
	selector: vscode.DocumentSelector,
	cmd: string,
	context: vscode.ExtensionContext,
	resolveStatusText: (text: string) => string,
	onRestart?: () => void,
) {

	const subscriptions: vscode.Disposable[] = [];
	const statusBar = vscode.languages.createLanguageStatusItem(cmd, selector);
	statusBar.command = {
		title: 'Select Version',
		command: cmd,
	};

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
					detail: vscodeTsdk.isWeb ? vscodeTsdk.path : undefined,
				},
				useConfigWorkspaceTsdk: configTsdkPath && !vscodeTsdk.isWeb ? {
					label: (tsdk.isWorkspacePath ? '• ' : '') + 'Use Workspace Version',
					description: await getTsVersion(await resolveWorkspaceTsdk(configTsdkPath) ?? '/') ?? 'Could not load the TypeScript version at this path',
					detail: configTsdkPath,
				} : undefined,
				useDefaultWorkspaceTsdk: configTsdkPath !== defaultTsdkPath && !vscodeTsdk.isWeb ? {
					label: (tsdk.isWorkspacePath ? '• ' : '') + 'Use Workspace Version',
					description: await getTsVersion(await resolveWorkspaceTsdk(defaultTsdkPath) ?? '/') ?? 'Could not load the TypeScript version at this path',
					detail: defaultTsdkPath,
				} : undefined,
			},
		]);

		if (select === undefined) {
			return; // cancel
		}
		if (select === 'useDefaultWorkspaceTsdk') {
			await vscode.workspace.getConfiguration('typescript').update('tsdk', defaultTsdkPath);
		}
		const useWorkspaceTsdk = select === 'useConfigWorkspaceTsdk' || select === 'useDefaultWorkspaceTsdk';
		if (useWorkspaceTsdk !== isUseWorkspaceTsdk(context)) {
			context.workspaceState.update('typescript.useWorkspaceTsdk', useWorkspaceTsdk);
			onRestart?.();
		}
		updateStatusBar();
	}

	function onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
		if (e.affectsConfiguration('typescript.tsdk') && isUseWorkspaceTsdk(context)) {
			onRestart?.();
		}
	}

	async function updateStatusBar() {
		const tsVersion = (await getTsdk(context)).version;
		statusBar.text = tsVersion ?? 'x.x.x';
		statusBar.text = resolveStatusText(statusBar.text);
	}
}

export async function getTsdk(context: vscode.ExtensionContext) {
	if (isUseWorkspaceTsdk(context)) {
		const tsdkPath = getConfigTsdkPath();
		if (tsdkPath) {
			const resolvedTsdk = await resolveWorkspaceTsdk(tsdkPath);
			if (resolvedTsdk) {
				return {
					tsdk: resolvedTsdk,
					version: await getTsVersion(resolvedTsdk),
					isWorkspacePath: true,
				};
			}
		}
	}
	const tsdk = await getVScodeTsdk();
	return {
		tsdk: tsdk.path,
		version: tsdk.version,
		isWorkspacePath: false,
	};
}

async function resolveWorkspaceTsdk(tsdk: string) {
	if (path.isAbsolute(tsdk)) {
		const libUri = vscode.Uri.joinPath(vscode.Uri.file(tsdk), 'typescript.js');
		const stat = await fs.stat(libUri);
		if (stat?.type === vscode.FileType.File) {
			return tsdk;
		}
	}
	else if (vscode.workspace.workspaceFolders) {
		for (const folder of vscode.workspace.workspaceFolders) {
			const tsdkPath = path.join(folder.uri.fsPath.replace(/\\/g, '/'), tsdk);
			const libUri = vscode.Uri.joinPath(vscode.Uri.file(tsdkPath), 'typescript.js');
			const stat = await fs.stat(libUri);
			if (stat?.type === vscode.FileType.File) {
				return tsdkPath;
			}
		}
	}
}

async function getVScodeTsdk() {

	const nightly = vscode.extensions.getExtension('ms-vscode.vscode-typescript-next');
	if (nightly) {
		const libPath = path.join(
			nightly.extensionPath.replace(/\\/g, '/'),
			'node_modules/typescript/lib',
		);
		return {
			path: libPath,
			version: await getTsVersion(libPath),
			isWeb: false,
		};
	}

	if (vscode.env.appRoot) {
		const libPath = path.join(
			vscode.env.appRoot.replace(/\\/g, '/'),
			'extensions/node_modules/typescript/lib',
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
	return vscode.workspace.getConfiguration('typescript').get<string>('tsdk')?.replace(/\\/g, '/');
}

function isUseWorkspaceTsdk(context: vscode.ExtensionContext) {
	return context.workspaceState.get('typescript.useWorkspaceTsdk', false);
}

async function getTsVersion(libPath: string): Promise<string | undefined> {

	const p = libPath.toString().split('/');
	const p2 = p.slice(0, -1);
	const modulePath = p2.join('/');
	const filePath = modulePath + '/package.json';
	const contents = await fs.readFile(vscode.Uri.file(filePath));

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
