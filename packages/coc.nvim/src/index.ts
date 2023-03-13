import * as coc from 'coc.nvim';
import { Location } from '@volar/language-server';

// TODO: @volar/vscode/src/features/*

export const middleware: coc.Middleware = {
	async provideCodeActions(document, range, context, token, next) {
		let actions = await next(document, range, context, token);
		actions = actions?.map(action => {
			if (typeof action.command === 'object') {
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

export function parseServerCommand(command: coc.Command) {
	if (command.command === 'editor.action.rename' && command.arguments) {
		return {
			...command,
			// TODO: test editor.action.rename command behavior in coc.nvim
			arguments: [[
				coc.Uri.parse(command.arguments[0]),
				coc.Position.create(command.arguments[1].line, command.arguments[1].character),
			]],
		};
	}
	else if (command.command === 'editor.action.showReferences' && command.arguments) {
		return {
			...command,
			arguments: [
				coc.Uri.parse(command.arguments[0]),
				coc.Position.create(command.arguments[1].line, command.arguments[1].character),
				command.arguments[2].map((ref: Location) => coc.Location.create(
					ref.uri,
					coc.Range.create(ref.range.start.line, ref.range.start.character, ref.range.end.line, ref.range.end.character),
				)),
			],
		};
	}
	return command;
}
