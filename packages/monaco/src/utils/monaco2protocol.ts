import { IRange, languages, Position } from 'monaco-editor-core';
import * as protocol from 'vscode-languageserver-protocol';

export function asPosition(position: Position): protocol.Position {
	return protocol.Position.create(position.lineNumber - 1, position.column - 1);
}

export function asRange(range: IRange): protocol.Range {
	return protocol.Range.create(
		range.startLineNumber - 1,
		range.startColumn - 1,
		range.endLineNumber - 1,
		range.endColumn - 1
	);
}

export function asCompletionContext(context: languages.CompletionContext): protocol.CompletionContext {
	return {
		triggerKind: asTriggerKind(context.triggerKind),
		triggerCharacter: context.triggerCharacter,
	};
}

export function asTriggerKind(kind: languages.CompletionTriggerKind): protocol.CompletionTriggerKind {
	switch (kind) {
		case languages.CompletionTriggerKind.Invoke:
			return protocol.CompletionTriggerKind.Invoked;
		case languages.CompletionTriggerKind.TriggerCharacter:
			return protocol.CompletionTriggerKind.TriggerCharacter;
		case languages.CompletionTriggerKind.TriggerForIncompleteCompletions:
			return protocol.CompletionTriggerKind.TriggerForIncompleteCompletions;
	}
}

export function asFormattingOptions(options: languages.FormattingOptions): protocol.FormattingOptions {
	return {
		tabSize: options.tabSize,
		insertSpaces: options.insertSpaces,
	};
}
