import { createUriMap } from '@volar/language-service';
import type * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { type LanguageServerState } from '../types';

export function register(server: LanguageServerState) {
	const folders = createUriMap<boolean>();
	const didChangeCallbacks = new Set<vscode.NotificationHandler<vscode.WorkspaceFoldersChangeEvent>>();

	server.onInitialize(serverCapabilities => {
		const { initializeParams } = server;
		if (initializeParams.workspaceFolders?.length) {
			for (const folder of initializeParams.workspaceFolders) {
				folders.set(URI.parse(folder.uri), true);
			}
		}
		else if (initializeParams.rootUri) {
			folders.set(URI.parse(initializeParams.rootUri), true);
		}
		else if (initializeParams.rootPath) {
			folders.set(URI.file(initializeParams.rootPath), true);
		}

		// #18
		serverCapabilities.workspace ??= {};
		serverCapabilities.workspace.workspaceFolders = {
			supported: true,
			changeNotifications: true,
		};
	});

	server.onInitialized(() => {
		if (server.initializeParams.capabilities.workspace?.workspaceFolders) {
			server.connection.workspace.onDidChangeWorkspaceFolders(e => {
				e.added = e.added.filter(folder => !folders.has(URI.parse(folder.uri)));
				e.removed = e.removed.filter(folder => folders.has(URI.parse(folder.uri)));
				if (e.added.length || e.removed.length) {
					for (const folder of e.added) {
						folders.set(URI.parse(folder.uri), true);
					}
					for (const folder of e.removed) {
						folders.delete(URI.parse(folder.uri));
					}
					server.project.reload();
					for (const cb of didChangeCallbacks) {
						cb(e);
					}
				}
			});
		}
	});

	return {
		get all() {
			return [...folders.keys()];
		},
		has(uri: URI) {
			return folders.has(uri);
		},
		onDidChange,
	};

	function onDidChange(cb: vscode.NotificationHandler<vscode.WorkspaceFoldersChangeEvent>) {
		didChangeCallbacks.add(cb);
		return {
			dispose() {
				didChangeCallbacks.delete(cb);
			},
		};
	}
}
