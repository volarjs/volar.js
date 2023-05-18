import type { editor, IMarkdownString, IRange, languages, MarkerSeverity, MarkerTag, IPosition, Uri } from 'monaco-editor-core';
import type * as protocol from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';

export function asCompletionList(list: protocol.CompletionList, range: protocol.Range): languages.CompletionList {
	return {
		incomplete: list.isIncomplete,
		suggestions: list.items.map(item => asCompletionItem(item, range)),
	};
}

export function asCompletionItemKind(kind: protocol.CompletionItemKind | undefined): languages.CompletionItemKind {
	switch (kind) {
		case 2 satisfies typeof protocol.CompletionItemKind.Method:
			return 0 satisfies languages.CompletionItemKind.Method;
		case 3 satisfies typeof protocol.CompletionItemKind.Function:
			return 1 satisfies languages.CompletionItemKind.Function;
		case 4 satisfies typeof protocol.CompletionItemKind.Constructor:
			return 2 satisfies languages.CompletionItemKind.Constructor;
		case 5 satisfies typeof protocol.CompletionItemKind.Field:
			return 3 satisfies languages.CompletionItemKind.Field;
		case 6 satisfies typeof protocol.CompletionItemKind.Variable:
			return 4 satisfies languages.CompletionItemKind.Variable;
		case 7 satisfies typeof protocol.CompletionItemKind.Class:
			return 5 satisfies languages.CompletionItemKind.Class;
		case 8 satisfies typeof protocol.CompletionItemKind.Interface:
			return 7 satisfies languages.CompletionItemKind.Interface;
		case 9 satisfies typeof protocol.CompletionItemKind.Module:
			return 8 satisfies languages.CompletionItemKind.Module;
		case 10 satisfies typeof protocol.CompletionItemKind.Property:
			return 9 satisfies languages.CompletionItemKind.Property;
		case 11 satisfies typeof protocol.CompletionItemKind.Unit:
			return 12 satisfies languages.CompletionItemKind.Unit;
		case 12 satisfies typeof protocol.CompletionItemKind.Value:
			return 13 satisfies languages.CompletionItemKind.Value;
		case 13 satisfies typeof protocol.CompletionItemKind.Enum:
			return 15 satisfies languages.CompletionItemKind.Enum;
		case 14 satisfies typeof protocol.CompletionItemKind.Keyword:
			return 17 satisfies languages.CompletionItemKind.Keyword;
		case 15 satisfies typeof protocol.CompletionItemKind.Snippet:
			return 27 satisfies languages.CompletionItemKind.Snippet;
		case 1 satisfies typeof protocol.CompletionItemKind.Text:
			return 18 satisfies languages.CompletionItemKind.Text;
		case 16 satisfies typeof protocol.CompletionItemKind.Color:
			return 19 satisfies languages.CompletionItemKind.Color;
		case 17 satisfies typeof protocol.CompletionItemKind.File:
			return 20 satisfies languages.CompletionItemKind.File;
		case 18 satisfies typeof protocol.CompletionItemKind.Reference:
			return 21 satisfies languages.CompletionItemKind.Reference;
		case 19 satisfies typeof protocol.CompletionItemKind.Folder:
			return 23 satisfies languages.CompletionItemKind.Folder;
		case 20 satisfies typeof protocol.CompletionItemKind.EnumMember:
			return 16 satisfies languages.CompletionItemKind.EnumMember;
		case 21 satisfies typeof protocol.CompletionItemKind.Constant:
			return 14 satisfies languages.CompletionItemKind.Constant;
		case 22 satisfies typeof protocol.CompletionItemKind.Struct:
			return 6 satisfies languages.CompletionItemKind.Struct;
		case 23 satisfies typeof protocol.CompletionItemKind.Event:
			return 10 satisfies languages.CompletionItemKind.Event;
		case 24 satisfies typeof protocol.CompletionItemKind.Operator:
			return 11 satisfies languages.CompletionItemKind.Operator;
		case 25 satisfies typeof protocol.CompletionItemKind.TypeParameter:
			return 24 satisfies languages.CompletionItemKind.TypeParameter;
		default:
			return 18 satisfies languages.CompletionItemKind.Text;
	}
}

export function asCompletionItem(item: protocol.CompletionItem, range: protocol.Range): languages.CompletionItem {
	return {
		label: item.label,
		kind: asCompletionItemKind(item.kind),
		tags: item.tags,
		detail: item.detail,
		documentation: item.documentation,
		sortText: item.sortText,
		filterText: item.filterText,
		preselect: item.preselect,
		insertText: item.textEdit?.newText ?? item.insertText ?? item.label,
		insertTextRules: 4 satisfies languages.CompletionItemInsertTextRule.InsertAsSnippet,
		range: item.textEdit ? asCompletionItemRange(item.textEdit) : asRange(range),
		commitCharacters: item.commitCharacters,
		additionalTextEdits: item.additionalTextEdits?.map(asTextEdit),
		command: item.command ? asCommand(item.command) : undefined,
	};
}

export function asCommand(command: protocol.Command): languages.Command {
	return {
		id: command.command,
		title: command.title,
		arguments: command.arguments,
	};
}

export function asTextEdit(edit: protocol.TextEdit): languages.TextEdit {
	return {
		range: asRange(edit.range),
		text: edit.newText,
	};
}

export function asCompletionItemRange(textEdit: NonNullable<protocol.CompletionItem['textEdit']>): languages.CompletionItem['range'] {
	if ('insert' in textEdit && 'replace' in textEdit) {
		const result: languages.CompletionItemRanges = {
			insert: asRange(textEdit.insert),
			replace: asRange(textEdit.replace),
		};
		return result;
	}
	return asRange(textEdit.range);
}

export function asRange(range: protocol.Range): IRange {
	return {
		startLineNumber: range.start.line + 1,
		startColumn: range.start.character + 1,
		endLineNumber: range.end.line + 1,
		endColumn: range.end.character + 1,
	};
}

export function asHover(hover: protocol.Hover): languages.Hover {
	return {
		contents: asMarkdownString(hover.contents),
		range: hover.range ? asRange(hover.range) : undefined,
	};
}

export function asMarkdownString(markdownString: protocol.Hover['contents']): IMarkdownString[] {
	if (typeof markdownString === 'string') {
		return [{ value: markdownString }];
	} else if (Array.isArray(markdownString)) {
		return markdownString.map(asMarkdownString).flat();
	} else {
		return [markdownString];
	}
}

export function asLocation(definition: protocol.LocationLink | protocol.Location): languages.Location {
	if ('targetUri' in definition && 'targetSelectionRange' in definition) {
		return {
			uri: asUri(definition.targetUri),
			range: asRange(definition.targetSelectionRange),
		};
	} else {
		return {
			uri: asUri(definition.uri),
			range: asRange(definition.range),
		};
	}
}

export function asUri(uri: protocol.URI): Uri {
	return URI.parse(uri);
}

export function asSignatureHelp(signatureHelp: protocol.SignatureHelp): languages.SignatureHelp {
	return {
		signatures: signatureHelp.signatures.map(asSignatureInformation),
		activeSignature: signatureHelp.activeSignature ?? 0,
		activeParameter: signatureHelp.activeParameter ?? 0,
	};
}

export function asSignatureInformation(signatureInformation: protocol.SignatureInformation): languages.SignatureInformation {
	return {
		label: signatureInformation.label,
		documentation: signatureInformation.documentation,
		parameters: signatureInformation.parameters
			? signatureInformation.parameters.map(asParameterInformation)
			: [],
		activeParameter: signatureInformation.activeParameter,
	};
}

export function asParameterInformation(parameterInformation: protocol.ParameterInformation): languages.ParameterInformation {
	return {
		label: parameterInformation.label,
		documentation: parameterInformation.documentation,
	};
}

export function asMarkerData(diagnostic: protocol.Diagnostic): editor.IMarkerData {
	return {
		code: diagnostic.code?.toString(),
		severity: asMarkerSeverity(diagnostic.severity),
		message: diagnostic.message,
		source: diagnostic.source,
		...asRange(diagnostic.range),
		relatedInformation:
			diagnostic.relatedInformation?.map(asRelatedInformation),
		tags: diagnostic.tags?.map(asMarkerTag),
	};
}

export function asMarkerTag(tag: protocol.DiagnosticTag): MarkerTag {
	switch (tag) {
		case 1 satisfies typeof protocol.DiagnosticTag.Unnecessary:
			return 1 satisfies MarkerTag.Unnecessary;
		case 2 satisfies typeof protocol.DiagnosticTag.Deprecated:
			return 2 satisfies MarkerTag.Deprecated;
	}
}

export function asRelatedInformation(relatedInformation: protocol.DiagnosticRelatedInformation): editor.IRelatedInformation {
	return {
		resource: asUri(relatedInformation.location.uri),
		message: relatedInformation.message,
		...asRange(relatedInformation.location.range),
	};
}

export function asMarkerSeverity(severity: protocol.DiagnosticSeverity | undefined): MarkerSeverity {
	switch (severity) {
		case 1 satisfies typeof protocol.DiagnosticSeverity.Error:
			return 8 satisfies MarkerSeverity.Error;
		case 2 satisfies typeof protocol.DiagnosticSeverity.Warning:
			return 4 satisfies MarkerSeverity.Warning;
		case 3 satisfies typeof protocol.DiagnosticSeverity.Information:
			return 2 satisfies MarkerSeverity.Info;
		case 4 satisfies typeof protocol.DiagnosticSeverity.Hint:
			return 1 satisfies MarkerSeverity.Hint;
		default:
			return 2 satisfies MarkerSeverity.Info;
	}
}

export function asWorkspaceEdit(workspaceEdit: protocol.WorkspaceEdit): languages.WorkspaceEdit {
	const result: languages.WorkspaceEdit = {
		edits: [],
	};
	if (workspaceEdit.changes) {
		for (const uri in workspaceEdit.changes) {
			const edits = workspaceEdit.changes[uri];
			for (const edit of edits) {
				result.edits.push({
					resource: asUri(uri),
					textEdit: asTextEdit(edit),
					versionId: undefined,
				});
			}
		}
	}
	if (workspaceEdit.documentChanges) {
		for (const documentChange of workspaceEdit.documentChanges) {
			if ('edits' in documentChange) {
				for (const edit of documentChange.edits) {
					result.edits.push({
						resource: asUri(documentChange.textDocument.uri),
						textEdit: asTextEdit(edit),
						versionId: documentChange.textDocument.version ?? undefined,
					});
				}
			} else if (documentChange.kind === 'create') {
				result.edits.push({
					newResource: asUri(documentChange.uri),
					options: {
						overwrite: documentChange.options?.overwrite ?? false,
						ignoreIfExists: documentChange.options?.ignoreIfExists ?? false,
					},
				});
			} else if (documentChange.kind === 'rename') {
				result.edits.push({
					oldResource: asUri(documentChange.oldUri),
					newResource: asUri(documentChange.newUri),
					options: {
						overwrite: documentChange.options?.overwrite ?? false,
						ignoreIfExists: documentChange.options?.ignoreIfExists ?? false,
					},
				});
			} else if (documentChange.kind === 'delete') {
				result.edits.push({
					oldResource: asUri(documentChange.uri),
					options: {
						recursive: documentChange.options?.recursive ?? false,
						ignoreIfNotExists:
							documentChange.options?.ignoreIfNotExists ?? false,
					},
				});
			}
		}
	}
	return result;
}

export function asDocumentSymbol(symbol: protocol.DocumentSymbol): languages.DocumentSymbol {
	return {
		name: symbol.name,
		detail: '',
		kind: asSymbolKind(symbol.kind),
		tags: symbol.tags?.map(asSymbolTag) ?? [],
		range: asRange(symbol.range),
		selectionRange: asRange(symbol.selectionRange),
		children: symbol.children
			? symbol.children.map(asDocumentSymbol)
			: undefined,
	};
}

export function asSymbolTag(tag: protocol.SymbolTag): languages.SymbolTag {
	switch (tag) {
		case 1 satisfies typeof protocol.SymbolTag.Deprecated:
			return 1 satisfies languages.SymbolTag.Deprecated;
	}
}

export function asSymbolKind(kind: protocol.SymbolKind): languages.SymbolKind {
	switch (kind) {
		case 1 satisfies typeof protocol.SymbolKind.File:
			return 0 satisfies languages.SymbolKind.File;
		case 2 satisfies typeof protocol.SymbolKind.Module:
			return 1 satisfies languages.SymbolKind.Module;
		case 3 satisfies typeof protocol.SymbolKind.Namespace:
			return 2 satisfies languages.SymbolKind.Namespace;
		case 4 satisfies typeof protocol.SymbolKind.Package:
			return 3 satisfies languages.SymbolKind.Package;
		case 5 satisfies typeof protocol.SymbolKind.Class:
			return 4 satisfies languages.SymbolKind.Class;
		case 6 satisfies typeof protocol.SymbolKind.Method:
			return 5 satisfies languages.SymbolKind.Method;
		case 7 satisfies typeof protocol.SymbolKind.Property:
			return 6 satisfies languages.SymbolKind.Property;
		case 8 satisfies typeof protocol.SymbolKind.Field:
			return 7 satisfies languages.SymbolKind.Field;
		case 9 satisfies typeof protocol.SymbolKind.Constructor:
			return 8 satisfies languages.SymbolKind.Constructor;
		case 10 satisfies typeof protocol.SymbolKind.Enum:
			return 9 satisfies languages.SymbolKind.Enum;
		case 11 satisfies typeof protocol.SymbolKind.Interface:
			return 10 satisfies languages.SymbolKind.Interface;
		case 12 satisfies typeof protocol.SymbolKind.Function:
			return 11 satisfies languages.SymbolKind.Function;
		case 13 satisfies typeof protocol.SymbolKind.Variable:
			return 12 satisfies languages.SymbolKind.Variable;
		case 14 satisfies typeof protocol.SymbolKind.Constant:
			return 13 satisfies languages.SymbolKind.Constant;
		case 15 satisfies typeof protocol.SymbolKind.String:
			return 14 satisfies languages.SymbolKind.String;
		case 16 satisfies typeof protocol.SymbolKind.Number:
			return 15 satisfies languages.SymbolKind.Number;
		case 17 satisfies typeof protocol.SymbolKind.Boolean:
			return 16 satisfies languages.SymbolKind.Boolean;
		case 18 satisfies typeof protocol.SymbolKind.Array:
			return 17 satisfies languages.SymbolKind.Array;
		case 19 satisfies typeof protocol.SymbolKind.Object:
			return 18 satisfies languages.SymbolKind.Object;
		case 20 satisfies typeof protocol.SymbolKind.Key:
			return 19 satisfies languages.SymbolKind.Key;
		case 21 satisfies typeof protocol.SymbolKind.Null:
			return 20 satisfies languages.SymbolKind.Null;
		case 22 satisfies typeof protocol.SymbolKind.EnumMember:
			return 21 satisfies languages.SymbolKind.EnumMember;
		case 23 satisfies typeof protocol.SymbolKind.Struct:
			return 22 satisfies languages.SymbolKind.Struct;
		case 24 satisfies typeof protocol.SymbolKind.Event:
			return 23 satisfies languages.SymbolKind.Event;
		case 25 satisfies typeof protocol.SymbolKind.Operator:
			return 24 satisfies languages.SymbolKind.Operator;
		case 26 satisfies typeof protocol.SymbolKind.TypeParameter:
			return 25 satisfies languages.SymbolKind.TypeParameter;
		default:
			return 0 satisfies languages.SymbolKind.File;
	}
}

export function asDocumentHighlight(highlight: protocol.DocumentHighlight): languages.DocumentHighlight {
	return {
		range: asRange(highlight.range),
		kind: asDocumentHighlightKind(highlight.kind),
	};
}

export function asDocumentHighlightKind(kind: protocol.DocumentHighlightKind | undefined): languages.DocumentHighlightKind {
	switch (kind) {
		case 1 satisfies typeof protocol.DocumentHighlightKind.Text:
			return 0 satisfies languages.DocumentHighlightKind.Text;
		case 2 satisfies typeof protocol.DocumentHighlightKind.Read:
			return 1 satisfies languages.DocumentHighlightKind.Read;
		case 3 satisfies typeof protocol.DocumentHighlightKind.Write:
			return 2 satisfies languages.DocumentHighlightKind.Write;
		default:
			return 0 satisfies languages.DocumentHighlightKind.Text;
	}
}

export function asCodeLens(item: protocol.CodeLens): languages.CodeLens {
	return {
		range: asRange(item.range),
		command: item.command ? asCommand(item.command) : undefined,
	};
}

export function asCodeAction(item: protocol.CodeAction): languages.CodeAction {
	return {
		title: item.title,
		command: item.command ? asCommand(item.command) : undefined,
		edit: item.edit ? asWorkspaceEdit(item.edit) : undefined,
		diagnostics: item.diagnostics
			? item.diagnostics.map(asMarkerData)
			: undefined,
		kind: item.kind,
		isPreferred: item.isPreferred,
		disabled: item.disabled?.reason,
	};
}

export function asLink(item: protocol.DocumentLink): languages.ILink {
	return {
		range: asRange(item.range),
		url: item.target,
		tooltip: item.tooltip,
	};
}

export function asColorInformation(item: protocol.ColorInformation): languages.IColorInformation {
	return {
		range: asRange(item.range),
		color: item.color,
	};
}

export function asColorPresentation(item: protocol.ColorPresentation): languages.IColorPresentation {
	return {
		label: item.label,
		textEdit: item.textEdit ? asTextEdit(item.textEdit) : undefined,
		additionalTextEdits: item.additionalTextEdits
			? item.additionalTextEdits.map(asTextEdit)
			: undefined,
	};
}

export function asFoldingRange(item: protocol.FoldingRange): languages.FoldingRange {
	return {
		start: item.startLine + 1,
		end: item.endLine + 1,
		kind: {
			value: item.kind ?? '',
		},
	};
}

export function asSelectionRange(item: protocol.SelectionRange): languages.SelectionRange {
	return {
		range: asRange(item.range),
	};
}

export function asInlayHint(item: protocol.InlayHint): languages.InlayHint {
	return {
		label: asInlayHintLabel(item.label),
		tooltip: item.tooltip,
		position: asPosition(item.position),
		kind: item.kind ? asInlayHintKind(item.kind) : undefined,
		paddingLeft: item.paddingLeft,
		paddingRight: item.paddingRight,
	};
}

export function asInlayHintKind(kind: protocol.InlayHintKind): languages.InlayHintKind {
	switch (kind) {
		case 2 satisfies typeof protocol.InlayHintKind.Parameter:
			return 2 satisfies languages.InlayHintKind.Parameter;
		case 1 satisfies typeof protocol.InlayHintKind.Type:
			return 1 satisfies languages.InlayHintKind.Type;
	}
}

export function asInlayHintLabel(label: protocol.InlayHint['label']): languages.InlayHint['label'] {
	if (typeof label === 'string') {
		return label;
	} else {
		return label.map(asInlayHintLabelPart);
	}
}

export function asInlayHintLabelPart(part: protocol.InlayHintLabelPart): languages.InlayHintLabelPart {
	return {
		label: part.value,
		tooltip: part.tooltip,
		command: part.command ? asCommand(part.command) : undefined,
		location: part.location ? asLocation(part.location) : undefined,
	};
}

export function asPosition(position: protocol.Position): IPosition {
	return {
		lineNumber: position.line + 1,
		column: position.character + 1,
	};
}
