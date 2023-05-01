import { DiagnosticModel, LanguageServerPlugin, InitializationOptions, ServerMode } from '../../types';
import * as vscode from 'vscode-languageserver';
import { Config } from '@volar/language-service';

export function setupCapabilities(
	server: vscode.ServerCapabilities,
	initOptions: InitializationOptions,
	plugins: ReturnType<LanguageServerPlugin>[],
	semanticTokensLegend: vscode.SemanticTokensLegend,
	services: NonNullable<Config['services']>,
) {

	const serviceInstances = Object.values(services)
		.map(service => typeof service === 'function' ? service(undefined, undefined) : service)
		.filter((service): service is NonNullable<typeof service> => !!service);
	const serverMode = initOptions.serverMode ?? ServerMode.Semantic;

	if (serverMode === ServerMode.Semantic || serverMode === ServerMode.Syntactic) {
		server.selectionRangeProvider = true;
		server.foldingRangeProvider = true;
		server.linkedEditingRangeProvider = true;
		server.colorProvider = true;
		server.documentSymbolProvider = true;
		server.documentFormattingProvider = true;
		server.documentRangeFormattingProvider = true;
		const characters = [...new Set(serviceInstances.map(service => service.autoFormatTriggerCharacters ?? []).flat())];
		if (characters.length) {
			server.documentOnTypeFormattingProvider = {
				firstTriggerCharacter: characters[0],
				moreTriggerCharacter: characters.slice(1),
			};
		}
	}

	if (serverMode === ServerMode.Semantic || serverMode === ServerMode.PartialSemantic) {
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
			triggerCharacters: [...new Set(serviceInstances.map(service => service.signatureHelpTriggerCharacters ?? []).flat())],
			retriggerCharacters: [...new Set(serviceInstances.map(service => service.signatureHelpRetriggerCharacters ?? []).flat())],
		};
		server.completionProvider = {
			triggerCharacters: [...new Set(serviceInstances.map(service => service.triggerCharacters ?? []).flat())],
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
		const exts = plugins.map(plugin => plugin.watchFileExtensions).flat();
		if (exts.length) {
			server.workspace = {
				fileOperations: {
					willRename: {
						filters: [
							{
								pattern: {
									glob: `**/*.{${exts.join(',')}}`
								}
							},
						]
					}
				}
			};
		}
		server.workspaceSymbolProvider = true;
	}

	// diagnostics are shunted in the api
	if ((initOptions.diagnosticModel ?? DiagnosticModel.Push) === DiagnosticModel.Pull) {
		server.diagnosticProvider = {
			interFileDependencies: true,
			workspaceDiagnostics: false,
		};
	}
}
