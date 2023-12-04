import { isDefinitionEnabled, isImplementationEnabled, isTypeDefinitionEnabled, type Language } from '@volar/language-core';
import { createDocumentProvider } from './documents';
import * as autoInsert from './languageFeatures/autoInsert';
import * as callHierarchy from './languageFeatures/callHierarchy';
import * as codeActionResolve from './languageFeatures/codeActionResolve';
import * as codeActions from './languageFeatures/codeActions';
import * as codeLens from './languageFeatures/codeLens';
import * as codeLensResolve from './languageFeatures/codeLensResolve';
import * as completions from './languageFeatures/complete';
import * as completionResolve from './languageFeatures/completeResolve';
import * as definition from './languageFeatures/definition';
import * as documentHighlight from './languageFeatures/documentHighlights';
import * as documentLinkResolve from './languageFeatures/documentLinkResolve';
import * as documentLink from './languageFeatures/documentLinks';
import * as semanticTokens from './languageFeatures/documentSemanticTokens';
import * as fileReferences from './languageFeatures/fileReferences';
import * as fileRename from './languageFeatures/fileRename';
import * as hover from './languageFeatures/hover';
import * as inlayHintResolve from './languageFeatures/inlayHintResolve';
import * as inlayHints from './languageFeatures/inlayHints';
import * as references from './languageFeatures/references';
import * as rename from './languageFeatures/rename';
import * as renamePrepare from './languageFeatures/renamePrepare';
import * as signatureHelp from './languageFeatures/signatureHelp';
import * as diagnostics from './languageFeatures/validation';
import * as workspaceSymbol from './languageFeatures/workspaceSymbols';
import * as documentDrop from './languageFeatures/documentDrop';
import type { ServicePlugin, ServiceContext, ServiceEnvironment } from './types';

import type * as vscode from 'vscode-languageserver-protocol';
import * as colorPresentations from './documentFeatures/colorPresentations';
import * as documentColors from './documentFeatures/documentColors';
import * as documentSymbols from './documentFeatures/documentSymbols';
import * as foldingRanges from './documentFeatures/foldingRanges';
import * as format from './documentFeatures/format';
import * as linkedEditing from './documentFeatures/linkedEditingRanges';
import * as selectionRanges from './documentFeatures/selectionRanges';

export type LanguageService = ReturnType<typeof createLanguageService>;

export function createLanguageService(
	language: Language,
	servicePlugins: ServicePlugin[],
	env: ServiceEnvironment,
) {

	const context = createServiceContext();

	return {

		getTriggerCharacters: () => context.services.map(service => service[0].triggerCharacters ?? []).flat(),
		getAutoFormatTriggerCharacters: () => context.services.map(service => service[0].autoFormatTriggerCharacters ?? []).flat(),
		getSignatureHelpTriggerCharacters: () => context.services.map(service => service[0].signatureHelpTriggerCharacters ?? []).flat(),
		getSignatureHelpRetriggerCharacters: () => context.services.map(service => service[0].signatureHelpRetriggerCharacters ?? []).flat(),

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
		};

		for (const servicePlugin of servicePlugins) {
			context.services.push([servicePlugin, servicePlugin.create(context)]);
		}

		return context;
	}
}
