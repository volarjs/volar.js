import { isDefinitionEnabled, isImplementationEnabled, isTypeDefinitionEnabled, type Language } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { createDocumentProvider } from './documents';
import * as autoInsert from './features/provideAutoInsertionEdit';
import * as callHierarchy from './features/provideCallHierarchyItems';
import * as codeActions from './features/provideCodeActions';
import * as codeLens from './features/provideCodeLenses';
import * as colorPresentations from './features/provideColorPresentations';
import * as completions from './features/provideCompletionItems';
import * as definition from './features/provideDefinition';
import * as diagnostics from './features/provideDiagnostics';
import * as documentColors from './features/provideDocumentColors';
import * as documentDrop from './features/provideDocumentDropEdits';
import * as format from './features/provideDocumentFormattingEdits';
import * as documentHighlight from './features/provideDocumentHighlights';
import * as documentLink from './features/provideDocumentLinks';
import * as semanticTokens from './features/provideDocumentSemanticTokens';
import * as documentSymbols from './features/provideDocumentSymbols';
import * as fileReferences from './features/provideFileReferences';
import * as fileRename from './features/provideFileRenameEdits';
import * as foldingRanges from './features/provideFoldingRanges';
import * as hover from './features/provideHover';
import * as inlayHints from './features/provideInlayHints';
import * as linkedEditing from './features/provideLinkedEditingRanges';
import * as references from './features/provideReferences';
import * as rename from './features/provideRenameEdits';
import * as renamePrepare from './features/provideRenameRange';
import * as selectionRanges from './features/provideSelectionRanges';
import * as signatureHelp from './features/provideSignatureHelp';
import * as workspaceSymbol from './features/provideWorkspaceSymbols';
import * as codeActionResolve from './features/resolveCodeAction';
import * as codeLensResolve from './features/resolveCodeLens';
import * as completionResolve from './features/resolveCompletionItem';
import * as documentLinkResolve from './features/resolveDocumentLink';
import * as inlayHintResolve from './features/resolveInlayHint';
import type { ServiceContext, ServiceEnvironment, ServicePlugin } from './types';

export type LanguageService = ReturnType<typeof createLanguageService>;

export function createLanguageService(
	language: Language,
	servicePlugins: ServicePlugin[],
	env: ServiceEnvironment,
) {

	const context = createServiceContext();

	return {

		getTriggerCharacters: () => servicePlugins.map(service => service.triggerCharacters ?? []).flat(),
		getAutoFormatTriggerCharacters: () => servicePlugins.map(service => service.autoFormatTriggerCharacters ?? []).flat(),
		getSignatureHelpTriggerCharacters: () => servicePlugins.map(service => service.signatureHelpTriggerCharacters ?? []).flat(),
		getSignatureHelpRetriggerCharacters: () => servicePlugins.map(service => service.signatureHelpRetriggerCharacters ?? []).flat(),

		format: format.register(context),
		getFoldingRanges: foldingRanges.register(context),
		getSelectionRanges: selectionRanges.register(context),
		findLinkedEditingRanges: linkedEditing.register(context),
		findDocumentSymbols: documentSymbols.register(context),
		findDocumentColors: documentColors.register(context),
		getColorPresentations: colorPresentations.register(context),

		doValidation: diagnostics.register(context),
		findReferences: references.register(context),
		findFileReferences: fileReferences.register(context),
		findDefinition: definition.register(context, 'provideDefinition', isDefinitionEnabled),
		findTypeDefinition: definition.register(context, 'provideTypeDefinition', isTypeDefinitionEnabled),
		findImplementations: definition.register(context, 'provideImplementation', isImplementationEnabled),
		prepareRename: renamePrepare.register(context),
		doRename: rename.register(context),
		getEditsForFileRename: fileRename.register(context),
		getSemanticTokens: semanticTokens.register(context),
		doHover: hover.register(context),
		doComplete: completions.register(context),
		doCodeActions: codeActions.register(context),
		doCodeActionResolve: codeActionResolve.register(context),
		doCompletionResolve: completionResolve.register(context),
		getSignatureHelp: signatureHelp.register(context),
		doCodeLens: codeLens.register(context),
		doCodeLensResolve: codeLensResolve.register(context),
		findDocumentHighlights: documentHighlight.register(context),
		findDocumentLinks: documentLink.register(context),
		doDocumentLinkResolve: documentLinkResolve.register(context),
		findWorkspaceSymbols: workspaceSymbol.register(context),
		doAutoInsert: autoInsert.register(context),
		doDocumentDrop: documentDrop.register(context),
		getInlayHints: inlayHints.register(context),
		doInlayHintResolve: inlayHintResolve.register(context),
		callHierarchy: callHierarchy.register(context),
		dispose: () => context.services.forEach(service => service[1].dispose?.()),
		context,
	};

	function createServiceContext() {

		const documents = createDocumentProvider(language.files);
		const context: ServiceContext = {
			env,
			language: language,
			inject: (key, ...args) => {
				for (const service of context.services) {
					if (context.disabledServicePlugins.has(service[1])) {
						continue;
					}
					const provide = service[1].provide?.[key as any];
					if (provide) {
						return provide(...args as any);
					}
				}
				throw `No service provide ${key as any}`;
			},
			services: [],
			documents: documents,
			commands: {
				rename: {
					create(uri, position) {
						return {
							title: '',
							command: 'editor.action.rename',
							arguments: [
								uri,
								position,
							],
						};
					},
					is(command) {
						return command.command === 'editor.action.rename';
					},
				},
				showReferences: {
					create(uri, position, locations) {
						return {
							title: locations.length === 1 ? '1 reference' : `${locations.length} references`,
							command: 'editor.action.showReferences',
							arguments: [
								uri,
								position,
								locations,
							],
						};
					},
					is(command) {
						return command.command === 'editor.action.showReferences';
					},
				},
				setSelection: {
					create(position: vscode.Position) {
						return {
							title: '',
							command: 'setSelection',
							arguments: [{
								selection: {
									selectionStartLineNumber: position.line + 1,
									positionLineNumber: position.line + 1,
									selectionStartColumn: position.character + 1,
									positionColumn: position.character + 1,
								},
							}],
						};
					},
					is(command) {
						return command.command === 'setSelection';
					}
				},
			},
			disabledVirtualFileUris: new Set(),
			disabledServicePlugins: new WeakSet(),
		};

		for (const servicePlugin of servicePlugins) {
			context.services.push([servicePlugin, servicePlugin.create(context)]);
		}

		return context;
	}
}
