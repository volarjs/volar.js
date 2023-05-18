import type { IMarkdownString, IRange, IPosition, languages } from 'monaco-editor-core';
import type * as protocol from 'vscode-languageserver-protocol';

export function asPosition(position: IPosition): protocol.Position {
	return {
		line: position.lineNumber - 1,
		character: position.column - 1,
	};
}

export function asRange(range: IRange): protocol.Range {
	return {
		start: asPosition({ lineNumber: range.startLineNumber, column: range.startColumn }),
		end: asPosition({ lineNumber: range.endLineNumber, column: range.endColumn }),
	};
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
		case 1 satisfies languages.SignatureHelpTriggerKind.Invoke as languages.SignatureHelpTriggerKind.Invoke:
			return 1 satisfies typeof protocol.SignatureHelpTriggerKind.Invoked;
		case 2 satisfies languages.SignatureHelpTriggerKind.TriggerCharacter as languages.SignatureHelpTriggerKind.TriggerCharacter:
			return 2 satisfies typeof protocol.SignatureHelpTriggerKind.TriggerCharacter;
		case 3 satisfies languages.SignatureHelpTriggerKind.ContentChange as languages.SignatureHelpTriggerKind.ContentChange:
			return 3 satisfies typeof protocol.SignatureHelpTriggerKind.ContentChange;
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
		case 0 satisfies languages.CompletionTriggerKind.Invoke as languages.CompletionTriggerKind.Invoke:
			return 1 satisfies typeof protocol.CompletionTriggerKind.Invoked;
		case 1 satisfies languages.CompletionTriggerKind.TriggerCharacter as languages.CompletionTriggerKind.TriggerCharacter:
			return 2 satisfies typeof protocol.CompletionTriggerKind.TriggerCharacter;
		case 2 satisfies languages.CompletionTriggerKind.TriggerForIncompleteCompletions as languages.CompletionTriggerKind.TriggerForIncompleteCompletions:
			return 3 satisfies typeof protocol.CompletionTriggerKind.TriggerForIncompleteCompletions;
	}
}

export function asFormattingOptions(options: languages.FormattingOptions): protocol.FormattingOptions {
	return {
		tabSize: options.tabSize,
		insertSpaces: options.insertSpaces,
	};
}
