import * as vscode from 'vscode-languageserver';
import type { LanguageServerState } from '../types';

export function register(server: LanguageServerState) {
	const configurations = new Map<string, Promise<any>>();
	const didChangeCallbacks = new Set<vscode.NotificationHandler<vscode.DidChangeConfigurationParams>>();

	server.onInitialized(() => {
		server.connection.onDidChangeConfiguration(params => {
			configurations.clear(); // TODO: clear only the configurations that changed
			for (const cb of didChangeCallbacks) {
				cb(params);
			}
		});
		const didChangeConfiguration = server.initializeParams.capabilities.workspace?.didChangeConfiguration;
		if (didChangeConfiguration?.dynamicRegistration) {
			server.connection.client.register(vscode.DidChangeConfigurationNotification.type);
		}
	});

	return {
		get,
		onDidChange,
	};

	function get<T>(section: string, scopeUri?: string): Promise<T | undefined> {
		if (!server.initializeParams.capabilities.workspace?.configuration) {
			return Promise.resolve(undefined);
		}
		const didChangeConfiguration = server.initializeParams.capabilities.workspace?.didChangeConfiguration;
		if (!scopeUri && didChangeConfiguration) {
			if (!configurations.has(section)) {
				configurations.set(section, getConfigurationWorker(section, scopeUri));
			}
			return configurations.get(section)!;
		}
		return getConfigurationWorker(section, scopeUri);
	}

	function onDidChange(cb: vscode.NotificationHandler<vscode.DidChangeConfigurationParams>) {
		didChangeCallbacks.add(cb);
		return {
			dispose() {
				didChangeCallbacks.delete(cb);
			},
		};
	}

	async function getConfigurationWorker(section: string, scopeUri?: string) {
		return (await server.connection.workspace.getConfiguration({ scopeUri, section }))
			?? undefined /* replace null to undefined */;
	}
}
