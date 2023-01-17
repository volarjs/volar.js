import * as vscode from 'vscode';

export { register as activateAutoInsertion } from './features/autoInsertion';
export { register as activateShowVirtualFiles } from './features/showVirtualFiles';
export { register as activateWriteVirtualFiles } from './features/writeVirtualFiles';
export { register as activateFindFileReferences } from './features/fileReferences';
export { register as activateReloadProjects } from './features/reloadProject';
export { register as activateServerStats } from './features/serverStatus';
export { register as activateTsConfigStatusItem } from './features/tsconfig';
export { register as activateShowReferences } from './features/showReferences';
export { register as activateServerSys } from './features/serverSys';
export { register as activateTsVersionStatusItem, getTsdk } from './features/tsVersion';

export function takeOverModeActive(context: vscode.ExtensionContext) {
	if (vscode.workspace.getConfiguration('volar').get<string>('takeOverMode.extension') === context.extension.id) {
		return !vscode.extensions.getExtension('vscode.typescript-language-features');
	}
	return false;
}
