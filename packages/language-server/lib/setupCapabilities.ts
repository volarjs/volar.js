import type { ServicePlugin } from '@volar/language-service';
import { DiagnosticModel, InitializationOptions } from './types';
import * as vscode from 'vscode-languageserver';

export function setupCapabilities(
	server: vscode.ServerCapabilities,
	initOptions: InitializationOptions,
	watchExts: string[],
	semanticTokensLegend: vscode.SemanticTokensLegend,
	services: ServicePlugin[],
) {

	server.selectionRangeProvider = true;
	server.foldingRangeProvider = true;
	server.linkedEditingRangeProvider = true;
	server.colorProvider = true;
	server.documentSymbolProvider = true;
	server.documentFormattingProvider = true;
	server.documentRangeFormattingProvider = true;
	const characters = [...new Set(services.map(service => service.autoFormatTriggerCharacters ?? []).flat())];
	if (characters.length) {
		server.documentOnTypeFormattingProvider = {
			firstTriggerCharacter: characters[0],
			moreTriggerCharacter: characters.slice(1),
		};
	}

	server.referencesProvider = true;
	server.implementationProvider = true;
	server.definitionProvider = true;
	server.typeDefinitionProvider = true;
	server.callHierarchyProvider = true;
	server.hoverProvider = true;
	server.renameProvider = {
		prepareProvider: true,
	};
	server.signatureHelpProvider = {
		triggerCharacters: [...new Set(services.map(service => service.signatureHelpTriggerCharacters ?? []).flat())],
		retriggerCharacters: [...new Set(services.map(service => service.signatureHelpRetriggerCharacters ?? []).flat())],
	};
	server.completionProvider = {
		triggerCharacters: [...new Set(services.map(service => service.triggerCharacters ?? []).flat())],
		resolveProvider: true,
	};
	if (initOptions.ignoreTriggerCharacters) {
		server.completionProvider.triggerCharacters = server.completionProvider.triggerCharacters
			?.filter(c => !initOptions.ignoreTriggerCharacters!.includes(c));
	}
	server.documentHighlightProvider = true;
	server.documentLinkProvider = {
		resolveProvider: true,
	};
	server.codeLensProvider = {
		resolveProvider: true,
	};
	server.semanticTokensProvider = {
		range: true,
		full: false,
		legend: semanticTokensLegend,
	};
	server.codeActionProvider = {
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
	};
	server.inlayHintProvider = {
		resolveProvider: true,
	};
	if (watchExts.length) {
		server.workspace = {
			fileOperations: {
				willRename: {
					filters: [
						{
							pattern: {
								glob: `**/*.{${watchExts.join(',')}}`
							}
						},
					]
				}
			}
		};
	}
	server.workspaceSymbolProvider = true;

	// diagnostics are shunted in the api
	if ((initOptions.diagnosticModel ?? DiagnosticModel.Push) === DiagnosticModel.Pull) {
		server.diagnosticProvider = {
			interFileDependencies: true,
			workspaceDiagnostics: false,
		};
	}
}
