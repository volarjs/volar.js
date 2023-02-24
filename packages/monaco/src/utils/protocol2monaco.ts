import { editor, IMarkdownString, IRange, languages, MarkerSeverity, MarkerTag, Position, Uri } from 'monaco-editor-core';
import * as protocol from 'vscode-languageserver-protocol';

export function asCompletionList(list: protocol.CompletionList, range: protocol.Range): languages.CompletionList {
	return {
		incomplete: list.isIncomplete,
		suggestions: list.items.map(item => asCompletionItem(item, range)),
	};
}

export function asCompletionItemKind(kind: protocol.CompletionItemKind | undefined): languages.CompletionItemKind {
	switch (kind) {
		case protocol.CompletionItemKind.Method:
			return languages.CompletionItemKind.Method;
		case protocol.CompletionItemKind.Function:
			return languages.CompletionItemKind.Function;
		case protocol.CompletionItemKind.Constructor:
			return languages.CompletionItemKind.Constructor;
		case protocol.CompletionItemKind.Field:
			return languages.CompletionItemKind.Field;
		case protocol.CompletionItemKind.Variable:
			return languages.CompletionItemKind.Variable;
		case protocol.CompletionItemKind.Class:
			return languages.CompletionItemKind.Class;
		case protocol.CompletionItemKind.Interface:
			return languages.CompletionItemKind.Interface;
		case protocol.CompletionItemKind.Module:
			return languages.CompletionItemKind.Module;
		case protocol.CompletionItemKind.Property:
			return languages.CompletionItemKind.Property;
		case protocol.CompletionItemKind.Unit:
			return languages.CompletionItemKind.Unit;
		case protocol.CompletionItemKind.Value:
			return languages.CompletionItemKind.Value;
		case protocol.CompletionItemKind.Enum:
			return languages.CompletionItemKind.Enum;
		case protocol.CompletionItemKind.Keyword:
			return languages.CompletionItemKind.Keyword;
		case protocol.CompletionItemKind.Snippet:
			return languages.CompletionItemKind.Snippet;
		case protocol.CompletionItemKind.Text:
			return languages.CompletionItemKind.Text;
		case protocol.CompletionItemKind.Color:
			return languages.CompletionItemKind.Color;
		case protocol.CompletionItemKind.File:
			return languages.CompletionItemKind.File;
		case protocol.CompletionItemKind.Reference:
			return languages.CompletionItemKind.Reference;
		case protocol.CompletionItemKind.Folder:
			return languages.CompletionItemKind.Folder;
		case protocol.CompletionItemKind.EnumMember:
			return languages.CompletionItemKind.EnumMember;
		case protocol.CompletionItemKind.Constant:
			return languages.CompletionItemKind.Constant;
		case protocol.CompletionItemKind.Struct:
			return languages.CompletionItemKind.Struct;
		case protocol.CompletionItemKind.Event:
			return languages.CompletionItemKind.Event;
		case protocol.CompletionItemKind.Operator:
			return languages.CompletionItemKind.Operator;
		case protocol.CompletionItemKind.TypeParameter:
			return languages.CompletionItemKind.TypeParameter;
		default:
			return languages.CompletionItemKind.Text;
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
		insertTextRules: languages.CompletionItemInsertTextRule.InsertAsSnippet,
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
	if (protocol.InsertReplaceEdit.is(textEdit)) {
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
	if (protocol.LocationLink.is(definition)) {
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
	return Uri.parse(uri);
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
		case protocol.DiagnosticTag.Unnecessary:
			return MarkerTag.Unnecessary;
		case protocol.DiagnosticTag.Deprecated:
			return MarkerTag.Deprecated;
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
		case protocol.DiagnosticSeverity.Error:
			return MarkerSeverity.Error;
		case protocol.DiagnosticSeverity.Warning:
			return MarkerSeverity.Warning;
		case protocol.DiagnosticSeverity.Information:
			return MarkerSeverity.Info;
		case protocol.DiagnosticSeverity.Hint:
			return MarkerSeverity.Hint;
		default:
			return MarkerSeverity.Info;
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
			if (protocol.TextDocumentEdit.is(documentChange)) {
				for (const edit of documentChange.edits) {
					result.edits.push({
						resource: asUri(documentChange.textDocument.uri),
						textEdit: asTextEdit(edit),
						versionId: documentChange.textDocument.version ?? undefined,
					});
				}
			} else if (protocol.CreateFile.is(documentChange)) {
				result.edits.push({
					newResource: asUri(documentChange.uri),
					options: {
						overwrite: documentChange.options?.overwrite ?? false,
						ignoreIfExists: documentChange.options?.ignoreIfExists ?? false,
					},
				});
			} else if (protocol.RenameFile.is(documentChange)) {
				result.edits.push({
					oldResource: asUri(documentChange.oldUri),
					newResource: asUri(documentChange.newUri),
					options: {
						overwrite: documentChange.options?.overwrite ?? false,
						ignoreIfExists: documentChange.options?.ignoreIfExists ?? false,
					},
				});
			} else if (protocol.DeleteFile.is(documentChange)) {
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
		case protocol.SymbolTag.Deprecated:
			return languages.SymbolTag.Deprecated;
	}
}

export function asSymbolKind(kind: protocol.SymbolKind): languages.SymbolKind {
	switch (kind) {
		case protocol.SymbolKind.File:
			return languages.SymbolKind.File;
		case protocol.SymbolKind.Module:
			return languages.SymbolKind.Module;
		case protocol.SymbolKind.Namespace:
			return languages.SymbolKind.Namespace;
		case protocol.SymbolKind.Package:
			return languages.SymbolKind.Package;
		case protocol.SymbolKind.Class:
			return languages.SymbolKind.Class;
		case protocol.SymbolKind.Method:
			return languages.SymbolKind.Method;
		case protocol.SymbolKind.Property:
			return languages.SymbolKind.Property;
		case protocol.SymbolKind.Field:
			return languages.SymbolKind.Field;
		case protocol.SymbolKind.Constructor:
			return languages.SymbolKind.Constructor;
		case protocol.SymbolKind.Enum:
			return languages.SymbolKind.Enum;
		case protocol.SymbolKind.Interface:
			return languages.SymbolKind.Interface;
		case protocol.SymbolKind.Function:
			return languages.SymbolKind.Function;
		case protocol.SymbolKind.Variable:
			return languages.SymbolKind.Variable;
		case protocol.SymbolKind.Constant:
			return languages.SymbolKind.Constant;
		case protocol.SymbolKind.String:
			return languages.SymbolKind.String;
		case protocol.SymbolKind.Number:
			return languages.SymbolKind.Number;
		case protocol.SymbolKind.Boolean:
			return languages.SymbolKind.Boolean;
		case protocol.SymbolKind.Array:
			return languages.SymbolKind.Array;
		case protocol.SymbolKind.Object:
			return languages.SymbolKind.Object;
		case protocol.SymbolKind.Key:
			return languages.SymbolKind.Key;
		case protocol.SymbolKind.Null:
			return languages.SymbolKind.Null;
		case protocol.SymbolKind.EnumMember:
			return languages.SymbolKind.EnumMember;
		case protocol.SymbolKind.Struct:
			return languages.SymbolKind.Struct;
		case protocol.SymbolKind.Event:
			return languages.SymbolKind.Event;
		case protocol.SymbolKind.Operator:
			return languages.SymbolKind.Operator;
		case protocol.SymbolKind.TypeParameter:
			return languages.SymbolKind.TypeParameter;
		default:
			return languages.SymbolKind.File;
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
		case protocol.DocumentHighlightKind.Text:
			return languages.DocumentHighlightKind.Text;
		case protocol.DocumentHighlightKind.Read:
			return languages.DocumentHighlightKind.Read;
		case protocol.DocumentHighlightKind.Write:
			return languages.DocumentHighlightKind.Write;
		default:
			return languages.DocumentHighlightKind.Text;
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
		case protocol.InlayHintKind.Parameter:
			return languages.InlayHintKind.Parameter;
		case protocol.InlayHintKind.Type:
			return languages.InlayHintKind.Type;
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

export function asPosition(position: protocol.Position): Position {
	return new Position(
		position.line + 1,
		position.character + 1,
	);
}
