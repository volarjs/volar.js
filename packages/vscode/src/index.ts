import * as vscode from 'vscode';

export { activate as activateAutoInsertion } from './features/autoInsertion';
export { activate as activateShowVirtualFiles } from './features/showVirtualFiles';
export { activate as activateWriteVirtualFiles } from './features/writeVirtualFiles';
export { activate as activateFindFileReferences } from './features/fileReferences';
export { activate as activateReloadProjects } from './features/reloadProject';
export { activate as activateServerStats } from './features/serverStatus';
export { activate as activateTsConfigStatusItem } from './features/tsconfig';
export { activate as activateShowReferences } from './features/showReferences';
export { activate as activateServerSys } from './features/serverSys';
export { activate as activateTsVersionStatusItem, getTsdk } from './features/tsVersion';

export function takeOverModeActive(context: vscode.ExtensionContext) {
	if (vscode.workspace.getConfiguration('volar').get<string>('takeOverMode.extension') === context.extension.id) {
		return !vscode.extensions.getExtension('vscode.typescript-language-features');
	}
	return false;
}
