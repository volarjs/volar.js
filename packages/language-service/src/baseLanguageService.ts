import { createLanguageContext, FileRangeCapabilities, LanguageServiceHost } from '@volar/language-core';
import * as tsFaster from 'typescript-auto-import-cache';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createDocumentsAndSourceMaps } from './documents';
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
import * as documentLink from './languageFeatures/documentLinks';
import * as documentLinkResolve from './languageFeatures/documentLinkResolve';
import * as semanticTokens from './languageFeatures/documentSemanticTokens';
import * as fileReferences from './languageFeatures/fileReferences';
import * as fileRename from './languageFeatures/fileRename';
import * as hover from './languageFeatures/hover';
import * as inlayHints from './languageFeatures/inlayHints';
import * as inlayHintResolve from './languageFeatures/inlayHintResolve';
import * as references from './languageFeatures/references';
import * as rename from './languageFeatures/rename';
import * as renamePrepare from './languageFeatures/renamePrepare';
import * as signatureHelp from './languageFeatures/signatureHelp';
import * as diagnostics from './languageFeatures/validation';
import * as workspaceSymbol from './languageFeatures/workspaceSymbols';
import { Config, ServiceContext, ServiceEnvironment } from './types';
import type * as ts from 'typescript/lib/tsserverlibrary';

import * as colorPresentations from './documentFeatures/colorPresentations';
import * as documentColors from './documentFeatures/documentColors';
import * as documentSymbols from './documentFeatures/documentSymbols';
import * as foldingRanges from './documentFeatures/foldingRanges';
import * as format from './documentFeatures/format';
import * as linkedEditingRanges from './documentFeatures/linkedEditingRanges';
import * as selectionRanges from './documentFeatures/selectionRanges';
import * as vscode from 'vscode-languageserver-protocol';

import { notEmpty, resolveCommonLanguageId } from './utils/common';

export type LanguageService = ReturnType<typeof createLanguageServiceBase>;

export function createLanguageService(
	modules: { typescript?: typeof import('typescript/lib/tsserverlibrary'); },
	env: ServiceEnvironment,
	config: Config,
	host: LanguageServiceHost,
	documentRegistry?: ts.DocumentRegistry,
) {
	const languageContext = createLanguageContext(modules, host, Object.values(config.languages ?? {}).filter(notEmpty));
	const context = createLanguageServicePluginContext(modules, env, config, host, languageContext, documentRegistry);
	return createLanguageServiceBase(context);
}

function createLanguageServicePluginContext(
	modules: { typescript?: typeof import('typescript/lib/tsserverlibrary'); },
	env: ServiceEnvironment,
	config: Config,
	host: LanguageServiceHost,
	languageContext: ReturnType<typeof createLanguageContext>,
	documentRegistry?: ts.DocumentRegistry,
) {
	const ts = modules.typescript;
	let tsLs: ts.LanguageService | undefined;

	if (ts) {
		const created = tsFaster.createLanguageService(
			ts,
			languageContext.typescript.languageServiceHost,
			proxiedHost => ts.createLanguageService(proxiedHost, documentRegistry),
			env.rootUri.path,
		);
		tsLs = created.languageService;

		if (created.setPreferences && env.getConfiguration) {

			updatePreferences();
			env.onDidChangeConfiguration?.(updatePreferences);

			async function updatePreferences() {
				const preferences = await env.getConfiguration?.<ts.UserPreferences>('typescript.preferences');
				if (preferences) {
					created.setPreferences?.(preferences);
				}
			}
		}

		if (created.projectUpdated) {
			let scriptFileNames = new Set(host.getScriptFileNames());
			env.onDidChangeWatchedFiles?.((params) => {
				if (params.changes.some(change => change.type !== vscode.FileChangeType.Changed)) {
					scriptFileNames = new Set(host.getScriptFileNames());
				}

				for (const change of params.changes) {
					if (scriptFileNames.has(env.uriToFileName(change.uri))) {
						created.projectUpdated?.(env.uriToFileName(env.rootUri.fsPath));
					}
				}
			});
		}
	}

	const textDocumentMapper = createDocumentsAndSourceMaps(env, host, languageContext.virtualFiles);
	const documents = new WeakMap<ts.IScriptSnapshot, TextDocument>();
	const documentVersions = new Map<string, number>();
	const context: ServiceContext = {
		env,
		inject: (key, ...args) => {
			for (const service of Object.values(context.services)) {
				const provide = service.provide?.[key as any];
				if (provide) {
					return provide(...args as any);
				}
			}
		},
		config,
		host,
		core: languageContext,
		services: {},
		typescript: tsLs ? {
			languageServiceHost: languageContext.typescript.languageServiceHost,
			languageService: tsLs,
		} : undefined,
		documents: textDocumentMapper,
		commands: {
			rename: {
				create(uri, position) {
					const source = toSourceLocation(uri, position, data => typeof data.rename === 'object' ? !!data.rename.normalize : !!data.rename);
					if (!source) {
						return;
					}
					return vscode.Command.create(
						'',
						'editor.action.rename',
						source.uri,
						source.position,
					);
				},
				is(command) {
					return command.command === 'editor.action.rename';
				},
			},
			showReferences: {
				create(uri, position, locations) {
					const source = toSourceLocation(uri, position);
					if (!source) {
						return;
					}
					const sourceReferences: vscode.Location[] = [];
					for (const reference of locations) {
						if (context.documents.isVirtualFileUri(reference.uri)) {
							for (const [_, map] of context.documents.getMapsByVirtualFileUri(reference.uri)) {
								const range = map.toSourceRange(reference.range);
								if (range) {
									sourceReferences.push({ uri: map.sourceFileDocument.uri, range });
								}
							}
						}
						else {
							sourceReferences.push(reference);
						}
					}
					return vscode.Command.create(
						locations.length === 1 ? '1 reference' : `${locations.length} references`,
						'editor.action.showReferences',
						source.uri,
						source.position,
						sourceReferences,
					);
				},
				is(command) {
					return command.command === 'editor.action.showReferences';
				},
			},
			setSelection: {
				create(position: vscode.Position) {
					return vscode.Command.create(
						'',
						'setSelection',
						{
							selection: {
								selectionStartLineNumber: position.line + 1,
								positionLineNumber: position.line + 1,
								selectionStartColumn: position.character + 1,
								positionColumn: position.character + 1,
							},
						},
					);
				},
				is(command) {
					return command.command === 'setSelection';
				}
			},
		},
		getTextDocument,
	};

	for (const serviceId in config.services ?? {}) {
		const service = config.services?.[serviceId];
		if (service) {
			context.services[serviceId] = service(context, modules);
		}
	}

	return context;

	function toSourceLocation(uri: string, position: vscode.Position, filter?: (data: FileRangeCapabilities) => boolean) {
		if (!textDocumentMapper.isVirtualFileUri(uri)) {
			return { uri, position };
		}
		const map = textDocumentMapper.getVirtualFileByUri(uri);
		if (map) {
			for (const [_, map] of context.documents.getMapsByVirtualFileUri(uri)) {
				const sourcePosition = map.toSourcePosition(position, filter);
				if (sourcePosition) {
					return {
						uri: map.sourceFileDocument.uri,
						position: sourcePosition,
					};
				}
			}
		}
	}

	function getTextDocument(uri: string) {

		const fileName = env.uriToFileName(uri);
		const scriptSnapshot = host.getScriptSnapshot(fileName);

		if (scriptSnapshot) {

			let document = documents.get(scriptSnapshot);

			if (!document) {

				const newVersion = (documentVersions.get(uri.toLowerCase()) ?? 0) + 1;

				documentVersions.set(uri.toLowerCase(), newVersion);

				document = TextDocument.create(
					uri,
					host.getScriptLanguageId?.(fileName) ?? resolveCommonLanguageId(uri),
					newVersion,
					scriptSnapshot.getText(0, scriptSnapshot.getLength()),
				);
				documents.set(scriptSnapshot, document);
			}

			return document;
		}
	}
}

function createLanguageServiceBase(context: ServiceContext) {

	return {

		triggerCharacters: Object.values(context.services).map(service => service?.triggerCharacters ?? []).flat(),
		autoFormatTriggerCharacters: Object.values(context.services).map(service => service?.autoFormatTriggerCharacters ?? []).flat(),
		signatureHelpTriggerCharacters: Object.values(context.services).map(service => service?.signatureHelpTriggerCharacters ?? []).flat(),
		signatureHelpRetriggerCharacters: Object.values(context.services).map(service => service?.signatureHelpRetriggerCharacters ?? []).flat(),

		format: format.register(context),
		getFoldingRanges: foldingRanges.register(context),
		getSelectionRanges: selectionRanges.register(context),
		findLinkedEditingRanges: linkedEditingRanges.register(context),
		findDocumentSymbols: documentSymbols.register(context),
		findDocumentColors: documentColors.register(context),
		getColorPresentations: colorPresentations.register(context),

		doValidation: diagnostics.register(context),
		findReferences: references.register(context),
		findFileReferences: fileReferences.register(context),
		findDefinition: definition.register(context, 'provideDefinition', data => !!data.definition, data => !!data.definition),
		findTypeDefinition: definition.register(context, 'provideTypeDefinition', data => !!data.definition, data => !!data.definition),
		findImplementations: definition.register(context, 'provideImplementation', data => !!data.references, () => false),
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
		getInlayHints: inlayHints.register(context),
		doInlayHintResolve: inlayHintResolve.register(context),
		callHierarchy: callHierarchy.register(context),
		dispose: () => context.typescript?.languageService.dispose(),
		context,
	};
}
