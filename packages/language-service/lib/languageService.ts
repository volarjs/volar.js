import {
	isDefinitionEnabled,
	isImplementationEnabled,
	isTypeDefinitionEnabled,
	type Language,
} from '@volar/language-core';
import type * as ts from 'typescript';
import type * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as autoInsert from './features/provideAutoInsertSnippet';
import * as hierarchy from './features/provideCallHierarchyItems';
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
import * as inlineValue from './features/provideInlineValue';
import * as linkedEditing from './features/provideLinkedEditingRanges';
import * as moniker from './features/provideMoniker';
import * as references from './features/provideReferences';
import * as rename from './features/provideRenameEdits';
import * as renamePrepare from './features/provideRenameRange';
import * as selectionRanges from './features/provideSelectionRanges';
import * as signatureHelp from './features/provideSignatureHelp';
import * as workspaceDiagnostics from './features/provideWorkspaceDiagnostics';
import * as workspaceSymbol from './features/provideWorkspaceSymbols';
import * as codeActionResolve from './features/resolveCodeAction';
import * as codeLensResolve from './features/resolveCodeLens';
import * as completionResolve from './features/resolveCompletionItem';
import * as documentLinkResolve from './features/resolveDocumentLink';
import * as inlayHintResolve from './features/resolveInlayHint';
import * as workspaceSymbolResolve from './features/resolveWorkspaceSymbol';
import type {
	LanguageServiceContext,
	LanguageServiceEnvironment,
	LanguageServicePlugin,
	ProjectContext,
} from './types';
import { NoneCancellationToken } from './utils/cancellation';
import { createUriMap, type UriMap } from './utils/uriMap';

export type LanguageService = ReturnType<typeof createLanguageServiceBase>;

export const embeddedContentScheme = 'volar-embedded-content';

export function createLanguageService(
	language: Language<URI>,
	plugins: LanguageServicePlugin[],
	env: LanguageServiceEnvironment,
	project: ProjectContext,
) {
	const documentVersions = createUriMap<number>();
	const snapshot2Doc = new WeakMap<ts.IScriptSnapshot, UriMap<TextDocument>>();
	const context: LanguageServiceContext = {
		language,
		project,
		getLanguageService: () => langaugeService,
		documents: {
			get(uri, languageId, snapshot) {
				if (!snapshot2Doc.has(snapshot)) {
					snapshot2Doc.set(snapshot, createUriMap());
				}
				const map = snapshot2Doc.get(snapshot)!;
				if (!map.has(uri)) {
					const version = documentVersions.get(uri) ?? 0;
					documentVersions.set(uri, version + 1);
					map.set(
						uri,
						TextDocument.create(
							uri.toString(),
							languageId,
							version,
							snapshot.getText(0, snapshot.getLength()),
						),
					);
				}
				return map.get(uri)!;
			},
		},
		env,
		inject: (key, ...args) => {
			for (const plugin of context.plugins) {
				if (context.disabledServicePlugins.has(plugin[1])) {
					continue;
				}
				const provide = plugin[1].provide?.[key as any];
				if (provide) {
					return provide(...args as any);
				}
			}
		},
		plugins: [],
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
				},
			},
		},
		disabledEmbeddedDocumentUris: createUriMap(),
		disabledServicePlugins: new WeakSet(),
		decodeEmbeddedDocumentUri,
		encodeEmbeddedDocumentUri,
	};
	for (const plugin of plugins) {
		context.plugins.push([plugin, plugin.create(context)]);
	}
	const langaugeService = createLanguageServiceBase(plugins, context);
	return langaugeService;
}

export function decodeEmbeddedDocumentUri(maybeEmbeddedContentUri: URI): [
	documentUri: URI,
	embeddedCodeId: string,
] | undefined {
	if (maybeEmbeddedContentUri.scheme === embeddedContentScheme) {
		const embeddedCodeId = decodeURIComponent(maybeEmbeddedContentUri.authority);
		const documentUri = decodeURIComponent(maybeEmbeddedContentUri.path.substring(1));
		return [
			URI.parse(documentUri),
			embeddedCodeId,
		];
	}
}

export function encodeEmbeddedDocumentUri(documentUri: URI, embeddedContentId: string): URI {
	if (embeddedContentId !== embeddedContentId.toLowerCase()) {
		console.error(`embeddedContentId must be lowercase: ${embeddedContentId}`);
	}
	return URI.from({
		scheme: embeddedContentScheme,
		authority: encodeURIComponent(embeddedContentId),
		path: '/' + encodeURIComponent(documentUri.toString()),
	});
}

function createLanguageServiceBase(
	plugins: LanguageServicePlugin[],
	context: LanguageServiceContext,
) {
	const tokenModifiers = plugins.map(plugin => plugin.capabilities.semanticTokensProvider?.legend?.tokenModifiers ?? [])
		.flat();
	const tokenTypes = plugins.map(plugin => plugin.capabilities.semanticTokensProvider?.legend?.tokenTypes ?? []).flat();
	return {
		semanticTokenLegend: {
			tokenModifiers: [...new Set(tokenModifiers)],
			tokenTypes: [...new Set(tokenTypes)],
		},
		commands: plugins.map(plugin => plugin.capabilities.executeCommandProvider?.commands ?? []).flat(),
		triggerCharacters: plugins.map(plugin => plugin.capabilities.completionProvider?.triggerCharacters ?? []).flat(),
		autoFormatTriggerCharacters: plugins.map(plugin =>
			plugin.capabilities.documentOnTypeFormattingProvider?.triggerCharacters ?? []
		).flat(),
		signatureHelpTriggerCharacters: plugins.map(plugin =>
			plugin.capabilities.signatureHelpProvider?.triggerCharacters ?? []
		).flat(),
		signatureHelpRetriggerCharacters: plugins.map(plugin =>
			plugin.capabilities.signatureHelpProvider?.retriggerCharacters ?? []
		).flat(),

		executeCommand(command: string, args: any[], token = NoneCancellationToken) {
			for (const plugin of context.plugins) {
				if (context.disabledServicePlugins.has(plugin[1])) {
					continue;
				}
				if (!plugin[1].executeCommand || !plugin[0].capabilities.executeCommandProvider?.commands.includes(command)) {
					continue;
				}
				return plugin[1].executeCommand(command, args, token);
			}
		},

		getDocumentFormattingEdits: format.register(context),
		getFoldingRanges: foldingRanges.register(context),
		getSelectionRanges: selectionRanges.register(context),
		getLinkedEditingRanges: linkedEditing.register(context),
		getDocumentSymbols: documentSymbols.register(context),
		getDocumentColors: documentColors.register(context),
		getColorPresentations: colorPresentations.register(context),
		getDiagnostics: diagnostics.register(context),
		getWorkspaceDiagnostics: workspaceDiagnostics.register(context),
		getReferences: references.register(context),
		getFileReferences: fileReferences.register(context),
		getDeclaration: definition.register(context, 'provideDeclaration', isDefinitionEnabled),
		getDefinition: definition.register(context, 'provideDefinition', isDefinitionEnabled),
		getTypeDefinition: definition.register(context, 'provideTypeDefinition', isTypeDefinitionEnabled),
		getImplementations: definition.register(context, 'provideImplementation', isImplementationEnabled),
		getRenameRange: renamePrepare.register(context),
		getRenameEdits: rename.register(context),
		getFileRenameEdits: fileRename.register(context),
		getSemanticTokens: semanticTokens.register(context),
		getHover: hover.register(context),
		getCompletionItems: completions.register(context),
		getCodeActions: codeActions.register(context),
		getSignatureHelp: signatureHelp.register(context),
		getCodeLenses: codeLens.register(context),
		getDocumentHighlights: documentHighlight.register(context),
		getDocumentLinks: documentLink.register(context),
		getWorkspaceSymbols: workspaceSymbol.register(context),
		getAutoInsertSnippet: autoInsert.register(context),
		getDocumentDropEdits: documentDrop.register(context),
		getInlayHints: inlayHints.register(context),
		getMoniker: moniker.register(context),
		getInlineValue: inlineValue.register(context),

		resolveCodeAction: codeActionResolve.register(context),
		resolveCompletionItem: completionResolve.register(context),
		resolveCodeLens: codeLensResolve.register(context),
		resolveDocumentLink: documentLinkResolve.register(context),
		resolveInlayHint: inlayHintResolve.register(context),
		resolveWorkspaceSymbol: workspaceSymbolResolve.register(context),

		...hierarchy.register(context),

		dispose: () => context.plugins.forEach(plugin => plugin[1].dispose?.()),
		context,
	};
}
