import * as embedded from '@volar/language-service';
import { DiagnosticModel, LanguageServerPlugin, LanguageServerInitializationOptions } from '../../types';
import * as vscode from 'vscode-languageserver';
import { ClientCapabilities } from 'vscode-languageserver';
import { Config } from '@volar/language-service';

export function setupCapabilities(
	params: ClientCapabilities,
	server: vscode.ServerCapabilities,
	initOptions: LanguageServerInitializationOptions,
	plugins: ReturnType<LanguageServerPlugin>[],
	semanticTokensLegend: vscode.SemanticTokensLegend,
	lsPlugins: NonNullable<Config['plugins']>,
) {

	const lsPluginInstances = Object.values(lsPlugins)
		.map(plugin => typeof plugin === 'function' ? plugin() : plugin)
		.filter((plugin): plugin is NonNullable<typeof plugin> => !!plugin);

	// Syntactic
	if (!initOptions.respectClientCapabilities || params.textDocument?.selectionRange) {
		server.selectionRangeProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.foldingRange) {
		server.foldingRangeProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.linkedEditingRange) {
		server.linkedEditingRangeProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.colorProvider) {
		server.colorProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.documentSymbol) {
		server.documentSymbolProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.formatting) {
		server.documentFormattingProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.rangeFormatting) {
		server.documentRangeFormattingProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.onTypeFormatting) {
		const characters = [...new Set(lsPluginInstances.map(plugin => plugin.autoFormatTriggerCharacters ?? []).flat())];
		if (characters.length) {
			server.documentOnTypeFormattingProvider = {
				firstTriggerCharacter: characters[0],
				moreTriggerCharacter: characters.slice(1),
			};
		}
	}

	// Semantic
	if (!initOptions.respectClientCapabilities || params.textDocument?.references) {
		server.referencesProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.implementation) {
		server.implementationProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.definition) {
		server.definitionProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.typeDefinition) {
		server.typeDefinitionProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.callHierarchy) {
		server.callHierarchyProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.hover) {
		server.hoverProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.rename) {
		server.renameProvider = {
			prepareProvider: true,
		};
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.signatureHelp) {
		server.signatureHelpProvider = {
			triggerCharacters: [...new Set(lsPluginInstances.map(plugin => plugin.signatureHelpTriggerCharacters ?? []).flat())],
			retriggerCharacters: [...new Set(lsPluginInstances.map(plugin => plugin.signatureHelpRetriggerCharacters ?? []).flat())],
		};
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.completion) {
		server.completionProvider = {
			triggerCharacters: [...new Set(lsPluginInstances.map(plugin => plugin.triggerCharacters ?? []).flat())],
			resolveProvider: true,
		};
		if (initOptions.ignoreTriggerCharacters) {
			server.completionProvider.triggerCharacters = server.completionProvider.triggerCharacters
				?.filter(c => !initOptions.ignoreTriggerCharacters!.includes(c));
		}
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.documentHighlight) {
		server.documentHighlightProvider = true;
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.documentLink) {
		server.documentLinkProvider = {
			resolveProvider: false, // TODO
		};
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.codeLens) {
		server.codeLensProvider = {
			resolveProvider: true,
		};
		server.executeCommandProvider ??= { commands: [] };
		server.executeCommandProvider.commands.push(embedded.showReferencesCommand);
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.semanticTokens) {
		server.semanticTokensProvider = {
			range: true,
			full: false,
			legend: semanticTokensLegend,
		};
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.codeAction) {
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
	}
	if (!initOptions.respectClientCapabilities || params.textDocument?.inlayHint) {
		server.inlayHintProvider = true;
	}
	if ((!initOptions.respectClientCapabilities || params.textDocument?.diagnostic) && (initOptions.diagnosticModel ?? DiagnosticModel.Push) === DiagnosticModel.Pull) {
		server.diagnosticProvider = {
			interFileDependencies: true,
			workspaceDiagnostics: false,
		};
	}

	// cross file features
	if (!initOptions.respectClientCapabilities || params.workspace?.fileOperations) {
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
	}
	if (!initOptions.respectClientCapabilities || params.workspace?.symbol) {
		server.workspaceSymbolProvider = true;
	}
}
