import type * as vscode from 'vscode';
import * as serverView from './views/serversView';
import * as servicePluginsView from './views/servicePluginsView';
import * as virtualCodesView from './views/virtualCodesView';

export function activate(context: vscode.ExtensionContext) {
	serverView.activate(context);
	virtualCodesView.activate(context);
	servicePluginsView.activate(context);
}
