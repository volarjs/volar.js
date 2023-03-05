import { IMarkdownString, IRange, languages, Position } from 'monaco-editor-core';
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

export function asSignatureHelpContext(context: languages.SignatureHelpContext): protocol.SignatureHelpContext {
	return {
		triggerKind: asSignatureHelpTriggerKind(context.triggerKind),
		triggerCharacter: context.triggerCharacter,
		isRetrigger: context.isRetrigger,
		activeSignatureHelp: context.activeSignatureHelp ? asSignatureHelp(context.activeSignatureHelp) : undefined,
	};
}

export function asSignatureHelpTriggerKind(kind: languages.SignatureHelpTriggerKind): protocol.SignatureHelpTriggerKind {
	switch (kind) {
		case languages.SignatureHelpTriggerKind.Invoke:
			return protocol.SignatureHelpTriggerKind.Invoked;
		case languages.SignatureHelpTriggerKind.TriggerCharacter:
			return protocol.SignatureHelpTriggerKind.TriggerCharacter;
		case languages.SignatureHelpTriggerKind.ContentChange:
			return protocol.SignatureHelpTriggerKind.ContentChange;
	}
}

export function asSignatureHelp(signatureHelp: languages.SignatureHelp): protocol.SignatureHelp {
	return {
		signatures: signatureHelp.signatures.map(asSignatureInformation),
		activeSignature: signatureHelp.activeSignature,
		activeParameter: signatureHelp.activeParameter,
	};
}

export function asSignatureInformation(signatureInformation: languages.SignatureInformation): protocol.SignatureInformation {
	return {
		label: signatureInformation.label,
		documentation: asMarkdownString(signatureInformation.documentation),
		parameters: signatureInformation.parameters.map(asParameterInformation),
		activeParameter: signatureInformation.activeParameter,
	};
}

export function asParameterInformation(parameterInformation: languages.ParameterInformation): protocol.ParameterInformation {
	return {
		label: parameterInformation.label,
		documentation: asMarkdownString(parameterInformation.documentation),
	};
}

export function asMarkdownString(entry: IMarkdownString | string | undefined): protocol.MarkupContent | string | undefined {
	if (!entry) {
		return undefined;
	}
	if (typeof entry === 'string') {
		return entry;
	}
	return {
		kind: 'markdown',
		value: entry.value,
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
