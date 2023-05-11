import * as vscode from 'vscode';
import * as serverView from './views/serversView';
import * as virtualFilesView from './views/virtualFilesView';

export async function activate(context: vscode.ExtensionContext) {
	serverView.activate(context);
	virtualFilesView.activate(context);
}
