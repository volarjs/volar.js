import { createUriMap } from '@volar/language-service';
import { URI } from 'vscode-uri';
import { LanguageServerState } from '../types';

export function register(server: LanguageServerState) {
	const folders = createUriMap<boolean>();

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
				for (const folder of e.added) {
					folders.set(URI.parse(folder.uri), true);
				}
				for (const folder of e.removed) {
					folders.delete(URI.parse(folder.uri));
				}
				server.project.reload();
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
	};
}
