import * as vscode from 'vscode';

export { activate as activateAutoInsertion } from './lib/features/autoInsertion';
export { activate as activateWriteVirtualFiles } from './lib/features/writeVirtualFiles';
export { activate as activateFindFileReferences } from './lib/features/fileReferences';
export { activate as activateReloadProjects } from './lib/features/reloadProject';
export { activate as activateTsConfigStatusItem } from './lib/features/tsconfig';
export { activate as activateServerSys } from './lib/features/serverSys';
export { activate as activateTsVersionStatusItem, getTsdk } from './lib/features/tsVersion';

export * from 'vscode-languageclient';

export function takeOverModeActive(context: vscode.ExtensionContext) {
	if (vscode.workspace.getConfiguration('volar').get<string>('takeOverMode.extension') === context.extension.id) {
		return !vscode.extensions.getExtension('vscode.typescript-language-features');
	}
	return false;
}

import type { BaseLanguageClient, Middleware } from 'vscode-languageclient';

export const middleware: Middleware = {
	async provideHover(document, position, token, next) {
		const hover = await next(document, position, token);
		for (const content of hover?.contents ?? []) {
			if (content instanceof vscode.MarkdownString) {
				content.isTrusted = true;
				content.supportHtml = true;
			}
		}
		return hover;
	},
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
				command.arguments[2].map((ref: any) => new vscode.Location(
					vscode.Uri.parse(ref.uri),
					new vscode.Range(ref.range.start.line, ref.range.start.character, ref.range.end.line, ref.range.end.character),
				)),
			],
		};
	}
	return command;
}

export const supportLabsVersion = '1.9.0' as const;

export interface ExportsInfoForLabs {
	volarLabs: {
		version: typeof supportLabsVersion;
		languageClients: BaseLanguageClient[];
		languageServerProtocol: typeof import('@volar/language-server/protocol');
		codegenStackSupport?: boolean;
	};
}
