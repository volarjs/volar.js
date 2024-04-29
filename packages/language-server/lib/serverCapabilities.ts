import * as vscode from 'vscode-languageserver';
import type { ServerBase } from './types';

export function getServerCapabilities(server: ServerBase) {
	const capabilities: vscode.ServerCapabilities = {
		textDocumentSync: vscode.TextDocumentSyncKind.Incremental,
		workspace: {
			// #18
			workspaceFolders: {
				supported: true,
				changeNotifications: true,
			},
		},
		selectionRangeProvider: true,
		foldingRangeProvider: true,
		linkedEditingRangeProvider: true,
		colorProvider: true,
		documentSymbolProvider: true,
		documentFormattingProvider: true,
		documentRangeFormattingProvider: true,
		referencesProvider: true,
		implementationProvider: true,
		definitionProvider: true,
		typeDefinitionProvider: true,
		callHierarchyProvider: true,
		hoverProvider: true,
		renameProvider: { prepareProvider: true },
		signatureHelpProvider: {
			triggerCharacters: [...new Set(server.languageServicePlugins.map(service => service.signatureHelpTriggerCharacters ?? []).flat())],
			retriggerCharacters: [...new Set(server.languageServicePlugins.map(service => service.signatureHelpRetriggerCharacters ?? []).flat())],
		},
		completionProvider: {
			triggerCharacters: [...new Set(server.languageServicePlugins.map(service => service.triggerCharacters ?? []).flat())],
			resolveProvider: true,
		},
		documentHighlightProvider: true,
		documentLinkProvider: { resolveProvider: true },
		codeLensProvider: { resolveProvider: true },
		semanticTokensProvider: {
			range: true,
			full: false,
			legend: server.semanticTokensLegend,
		},
		codeActionProvider: {
			codeActionKinds: [
				vscode.CodeActionKind.Empty,
				vscode.CodeActionKind.QuickFix,
				vscode.CodeActionKind.Refactor,
				vscode.CodeActionKind.RefactorExtract,
				vscode.CodeActionKind.RefactorInline,
				vscode.CodeActionKind.RefactorRewrite,
				vscode.CodeActionKind.Source,
				vscode.CodeActionKind.SourceFixAll,
				vscode.CodeActionKind.SourceOrganizeImports,
			],
			resolveProvider: true,
		},
		inlayHintProvider: { resolveProvider: true },
		workspaceSymbolProvider: true,
		diagnosticProvider: {
			interFileDependencies: true,
			workspaceDiagnostics: false,
		},
	};

	const characters = [...new Set(server.languageServicePlugins.map(service => service.autoFormatTriggerCharacters ?? []).flat())];
	if (characters.length) {
		capabilities.documentOnTypeFormattingProvider = {
			firstTriggerCharacter: characters[0],
			moreTriggerCharacter: characters.slice(1),
		};
	}

	return capabilities;
}
