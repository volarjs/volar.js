import type * as vscode from 'vscode';

type Workspace = Pick<typeof vscode.workspace, 'getConfiguration'>;

export const unifiedTsdkSetting = { section: 'js/ts', key: 'tsdk.path' };
export const legacyTsdkSetting = { section: 'typescript', key: 'tsdk' };

export function readTsdkSetting(workspace: Workspace) {
	const unified = workspace.getConfiguration(unifiedTsdkSetting.section);
	const inspect = unified.inspect<string>(unifiedTsdkSetting.key);
	const tsdk = inspect?.globalValue !== undefined
			|| inspect?.workspaceValue !== undefined
			|| inspect?.workspaceFolderValue !== undefined
		? unified.get<string>(unifiedTsdkSetting.key)
		: workspace.getConfiguration(legacyTsdkSetting.section).get<string>(legacyTsdkSetting.key);
	return tsdk?.replace(/\\/g, '/');
}

// `js/ts.tsdk.path` replaced the deprecated `typescript.tsdk` in VS Code 1.110.
export function getWritableTsdkSetting(vscodeVersion: string) {
	const [major, minor] = vscodeVersion.split('.').map(Number);
	const { section, key } = major > 1 || (major === 1 && minor >= 110) ? unifiedTsdkSetting : legacyTsdkSetting;
	return { section, key, id: `${section}.${key}` };
}
