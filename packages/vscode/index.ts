import * as vscode from 'vscode';
import * as protocol from './protocol.js';

export { activate as activateAutoInsertion } from './lib/features/autoInsertion';
export { activate as activateDocumentDropEdit } from './lib/features/documentDropEdits';
export { activate as activateFindFileReferences } from './lib/features/fileReferences';
export { activate as activateReloadProjects } from './lib/features/reloadProject';
export { activate as activateTsConfigStatusItem } from './lib/features/tsconfig';
export { activate as activateTsVersionStatusItem, getTsdk } from './lib/features/tsVersion';

export * from 'vscode-languageclient';

import type { BaseLanguageClient, Middleware } from 'vscode-languageclient';

export const middleware: Middleware = {
	async provideCodeActions(document, range, context, token, next) {
		let actions = await next(document, range, context, token);
		actions = actions?.map(action => {
			if (!(action instanceof vscode.CodeAction)) {
				return parseServerCommand(action);
			}
			if (action.command) {
				action.command = parseServerCommand(action.command);
			}
			return action;
		});
		return actions;
	},
	async resolveCodeAction(item, token, next) {
		const action = await next(item, token);
		if (action?.command) {
			action.command = parseServerCommand(action.command);
		}
		return action;
	},
	async provideCodeLenses(document, token, next) {
		let codeLenses = await next(document, token);
		codeLenses = codeLenses?.map(action => {
			if (action.command) {
				action.command = parseServerCommand(action.command);
			}
			return action;
		});
		return codeLenses;
	},
	async resolveCodeLens(item, token, next) {
		const codeLens = await next(item, token);
		if (codeLens?.command) {
			codeLens.command = parseServerCommand(codeLens.command);
		}
		return codeLens;
	},
};

export function parseServerCommand(command: vscode.Command) {
	if (command.command === 'editor.action.rename' && command.arguments) {
		return {
			...command,
			arguments: [[
				vscode.Uri.parse(command.arguments[0]),
				new vscode.Position(command.arguments[1].line, command.arguments[1].character),
			]],
		};
	}
	else if (command.command === 'editor.action.showReferences' && command.arguments) {
		return {
			...command,
			arguments: [
				vscode.Uri.parse(command.arguments[0]),
				new vscode.Position(command.arguments[1].line, command.arguments[1].character),
				command.arguments[2].map((ref: any) =>
					new vscode.Location(
						vscode.Uri.parse(ref.uri),
						new vscode.Range(
							ref.range.start.line,
							ref.range.start.character,
							ref.range.end.line,
							ref.range.end.character,
						),
					)
				),
			],
		};
	}
	return command;
}

export const currentLabsVersion = '2.3.1';

export function createLabsInfo(_?: typeof import('@volar/language-server/protocol')) {
	const onDidAddLanguageClientEmitter = new vscode.EventEmitter<BaseLanguageClient>();
	const extensionExports: LabsInfo = {
		volarLabs: {
			version: currentLabsVersion,
			languageClients: [] as BaseLanguageClient[],
			languageServerProtocol: protocol,
			onDidAddLanguageClient: onDidAddLanguageClientEmitter.event,
		},
	};
	return {
		extensionExports,
		addLanguageClient(languageClient: BaseLanguageClient) {
			extensionExports.volarLabs.languageClients.push(languageClient);
			onDidAddLanguageClientEmitter.fire(languageClient);
		},
	};
}

export interface LabsInfo {
	volarLabs: {
		version: typeof currentLabsVersion;
		languageClients: BaseLanguageClient[];
		onDidAddLanguageClient: vscode.Event<BaseLanguageClient>;
		languageServerProtocol: typeof import('./protocol.js');
	};
}
