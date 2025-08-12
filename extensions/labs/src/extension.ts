import type * as vscode from 'vscode';
import * as serverView from './views/serversView';
import * as virtualCodesView from './views/virtualCodesView';
import * as servicePluginsView from './views/servicePluginsView';

export function activate(context: vscode.ExtensionContext) {
	serverView.activate(context);
	virtualCodesView.activate(context);
	servicePluginsView.activate(context);
}
