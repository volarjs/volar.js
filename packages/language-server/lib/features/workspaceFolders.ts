import { createUriMap } from '@volar/language-service';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { LanguageServerProject } from '../types';

export function register(
	connection: vscode.Connection,
	params: vscode.InitializeParams,
	project: LanguageServerProject,
	serverCapabilities: vscode.ServerCapabilities
) {
	const folders = createUriMap<boolean>();

	if (params.workspaceFolders?.length) {
		for (const folder of params.workspaceFolders) {
			folders.set(URI.parse(folder.uri), true);
		}
	}
	else if (params.rootUri) {
		folders.set(URI.parse(params.rootUri), true);
	}
	else if (params.rootPath) {
		folders.set(URI.file(params.rootPath), true);
	}

	if (params.capabilities.workspace?.workspaceFolders) {
		connection.workspace.onDidChangeWorkspaceFolders(e => {
			for (const folder of e.added) {
				folders.set(URI.parse(folder.uri), true);
			}
			for (const folder of e.removed) {
				folders.delete(URI.parse(folder.uri));
			}
			project.reload();
		});
	}

	// #18
	serverCapabilities.workspace ??= {};
	serverCapabilities.workspace.workspaceFolders = {
		supported: true,
		changeNotifications: true,
	};

	return {
		get all() {
			return [...folders.keys()];
		},
		has(uri: URI) {
			return folders.has(uri);
		},
	};
}
