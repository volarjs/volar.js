import { decodeEmbeddedDocumentUri, LanguageService, mergeWorkspaceEdits } from '@volar/language-service';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { AutoInsertRequest, FindFileReferenceRequest } from '../../protocol';
import type { LanguageServer } from '../types';

export function registerLanguageFeatures(server: LanguageServer) {
	const {
		documentFormattingProvider,
		documentRangeFormattingProvider,
		documentOnTypeFormattingProvider,
		selectionRangeProvider,
		foldingRangeProvider,
		linkedEditingRangeProvider,
		documentSymbolProvider,
		colorProvider,
		completionProvider,
		hoverProvider,
		signatureHelpProvider,
		renameProvider,
		codeLensProvider,
		codeActionProvider,
		referencesProvider,
		implementationProvider,
		definitionProvider,
		typeDefinitionProvider,
		documentHighlightProvider,
		documentLinkProvider,
		workspaceSymbolProvider,
		callHierarchyProvider,
		semanticTokensProvider,
		diagnosticProvider,
		inlayHintProvider,
		experimental,
	} = server.initializeResult.capabilities;

	let lastCompleteUri: string;
	let lastCompleteLs: LanguageService | undefined;
	let lastCodeLensLs: LanguageService | undefined;
	let lastCodeActionLs: LanguageService | undefined;
	let lastCallHierarchyLs: LanguageService | undefined;
	let lastDocumentLinkLs: LanguageService | undefined;
	let lastInlayHintLs: LanguageService | undefined;

	if (documentFormattingProvider) {
		server.connection.onDocumentFormatting(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getDocumentFormattingEdits(uri, params.options, undefined, undefined, token);
			});
		});
	}
	if (documentRangeFormattingProvider) {
		server.connection.onDocumentRangeFormatting(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getDocumentFormattingEdits(uri, params.options, params.range, undefined, token);
			});
		});
	}
	if (documentOnTypeFormattingProvider) {
		server.connection.onDocumentOnTypeFormatting(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getDocumentFormattingEdits(uri, params.options, undefined, params, token);
			});
		});
	}
	if (selectionRangeProvider) {
		server.connection.onSelectionRanges(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getSelectionRanges(uri, params.positions, token);
			});
		});
	}
	if (foldingRangeProvider) {
		server.connection.onFoldingRanges(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getFoldingRanges(uri, token);
			});
		});
	}
	if (linkedEditingRangeProvider) {
		server.connection.languages.onLinkedEditingRange(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getLinkedEditingRanges(uri, params.position, token);
			});
		});
	}
	if (documentSymbolProvider) {
		server.connection.onDocumentSymbol(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getDocumentSymbols(uri, token);
			});
		});
	}
	if (colorProvider) {
		server.connection.onDocumentColor(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getDocumentColors(uri, token);
			});
		});
		server.connection.onColorPresentation(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getColorPresentations(uri, params.color, params.range, token);
			});
		});
	}
	if (completionProvider) {
		server.connection.onCompletion(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, async languageService => {
				lastCompleteUri = params.textDocument.uri;
				lastCompleteLs = languageService;
				const list = await languageService.getCompletionItems(
					uri,
					params.position,
					params.context,
					token
				);
				for (const item of list.items) {
					fixTextEdit(item);
				}
				return list;
			});
		});
	}
	if (completionProvider?.resolveProvider) {
		server.connection.onCompletionResolve(async (item, token) => {
			if (lastCompleteUri && lastCompleteLs) {
				item = await lastCompleteLs.resolveCompletionItem(item, token);
				fixTextEdit(item);
			}
			return item;
		});
	}
	if (hoverProvider) {
		server.connection.onHover(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getHover(uri, params.position, token);
			});
		});
	}
	if (signatureHelpProvider) {
		server.connection.onSignatureHelp(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getSignatureHelp(uri, params.position, params.context, token);
			});
		});
	}
	if (renameProvider) {
		server.connection.onRenameRequest(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getRenameEdits(uri, params.position, params.newName, token);
			});
		});
	}
	if (typeof renameProvider === 'object' && renameProvider.prepareProvider) {
		server.connection.onPrepareRename(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, async languageService => {
				const result = await languageService.getRenameRange(uri, params.position, token);
				if (result && 'message' in result) {
					return new vscode.ResponseError(0, result.message);
				}
				return result;
			});
		});
	}
	if (codeLensProvider) {
		server.connection.onCodeLens(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				lastCodeLensLs = languageService;
				return languageService.getCodeLenses(uri, token);
			});
		});
	}
	if (codeLensProvider?.resolveProvider) {
		server.connection.onCodeLensResolve(async (codeLens, token) => {
			return await lastCodeLensLs?.resolveCodeLens(codeLens, token) ?? codeLens;
		});
	}
	if (codeActionProvider) {
		server.connection.onCodeAction(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, async languageService => {
				lastCodeActionLs = languageService;
				let codeActions = await languageService.getCodeActions(uri, params.range, params.context, token) ?? [];
				for (const codeAction of codeActions) {
					if (codeAction.data && typeof codeAction.data === 'object') {
						(codeAction.data as any).uri = params.textDocument.uri;
					}
					else {
						codeAction.data = { uri: params.textDocument.uri };
					}
				}
				if (!server.initializeParams?.capabilities.textDocument?.codeAction?.disabledSupport) {
					codeActions = codeActions.filter(codeAction => !codeAction.disabled);
				}
				return codeActions;
			});
		});
	}
	if (typeof codeActionProvider === 'object' && codeActionProvider.resolveProvider) {
		server.connection.onCodeActionResolve(async (codeAction, token) => {
			return await lastCodeActionLs?.resolveCodeAction(codeAction, token) ?? codeAction;
		});
	}
	if (referencesProvider) {
		server.connection.onReferences(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getReferences(uri, params.position, { includeDeclaration: true }, token);
			});
		});
	}
	if (implementationProvider) {
		server.connection.onImplementation(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getImplementations(uri, params.position, token);
			});
		});
	}
	if (definitionProvider) {
		server.connection.onDefinition(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getDefinition(uri, params.position, token);
			});
		});
	}
	if (typeDefinitionProvider) {
		server.connection.onTypeDefinition(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getTypeDefinition(uri, params.position, token);
			});
		});
	}
	if (documentHighlightProvider) {
		server.connection.onDocumentHighlight(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getDocumentHighlights(uri, params.position, token);
			});
		});
	}
	if (documentLinkProvider) {
		server.connection.onDocumentLinks(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				lastDocumentLinkLs = languageService;
				return languageService.getDocumentLinks(uri, token);
			});
		});
	}
	if (documentLinkProvider?.resolveProvider) {
		server.connection.onDocumentLinkResolve(async (link, token) => {
			return await lastDocumentLinkLs?.resolveDocumentLink(link, token);
		});
	}
	if (workspaceSymbolProvider) {
		server.connection.onWorkspaceSymbol(async (params, token) => {
			let results: vscode.WorkspaceSymbol[] = [];
			for (const languageService of await server.project.getExistingLanguageServices()) {
				if (token.isCancellationRequested) {
					return;
				}
				results = results.concat(await languageService.getWorkspaceSymbols(params.query, token));
			}
			return results;
		});
	}
	if (typeof workspaceSymbolProvider === 'object' && workspaceSymbolProvider.resolveProvider) {
		// TODO: onWorkspaceSymbolResolve
	}
	if (callHierarchyProvider) {
		server.connection.languages.callHierarchy.onPrepare(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				lastCallHierarchyLs = languageService;
				return languageService.getCallHierarchyItems(uri, params.position, token);
			}) ?? [];
		});
		server.connection.languages.callHierarchy.onIncomingCalls(async (params, token) => {
			return await lastCallHierarchyLs?.getCallHierarchyIncomingCalls(params.item, token) ?? [];
		});
		server.connection.languages.callHierarchy.onOutgoingCalls(async (params, token) => {
			return await lastCallHierarchyLs?.getCallHierarchyOutgoingCalls(params.item, token) ?? [];
		});
	}
	if (semanticTokensProvider?.full) {
		server.connection.languages.semanticTokens.on(async (params, token, _, resultProgress) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, async languageService => {
				return await languageService?.getSemanticTokens(
					uri,
					undefined,
					server.initializeResult.capabilities.semanticTokensProvider!.legend,
					token,
					tokens => resultProgress?.report(tokens)
				);
			}) ?? { data: [] };
		});
	}
	if (semanticTokensProvider?.range) {
		server.connection.languages.semanticTokens.onRange(async (params, token, _, resultProgress) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, async languageService => {
				return await languageService?.getSemanticTokens(
					uri,
					params.range,
					server.initializeResult.capabilities.semanticTokensProvider!.legend,
					token,
					tokens => resultProgress?.report(tokens)
				);
			}) ?? { data: [] };
		});
	}
	if (diagnosticProvider) {
		server.connection.languages.diagnostics.on(async (params, token, _workDoneProgressReporter, resultProgressReporter) => {
			const uri = URI.parse(params.textDocument.uri);
			const result = await worker(uri, token, languageService => {
				return languageService.getDiagnostics(
					uri,
					token,
					errors => {
						// resultProgressReporter is undefined in vscode
						resultProgressReporter?.report({
							relatedDocuments: {
								[params.textDocument.uri]: {
									kind: vscode.DocumentDiagnosticReportKind.Full,
									items: errors,
								},
							},
						});
					}
				);
			});
			return {
				kind: vscode.DocumentDiagnosticReportKind.Full,
				items: result ?? [],
			};
		});
	}
	if (diagnosticProvider?.workspaceDiagnostics) {
		server.connection.languages.diagnostics.onWorkspace(async (_params, token) => {
			const items: vscode.WorkspaceDocumentDiagnosticReport[] = [];
			for (const languageService of await server.project.getExistingLanguageServices()) {
				if (token.isCancellationRequested) {
					break;
				}
				const result = await languageService.getWorkspaceDiagnostics(token);
				items.push(...result);
			}
			return { items };
		});
	}
	if (inlayHintProvider) {
		server.connection.languages.inlayHint.on(async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				lastInlayHintLs = languageService;
				return languageService.getInlayHints(uri, params.range, token);
			});
		});
	}
	if (typeof inlayHintProvider === 'object' && inlayHintProvider.resolveProvider) {
		server.connection.languages.inlayHint.resolve(async (hint, token) => {
			return await lastInlayHintLs?.resolveInlayHint(hint, token) ?? hint;
		});
	}
	if (experimental?.fileRenameProvider) {
		server.connection.workspace.onWillRenameFiles(async (params, token) => {
			const _edits = await Promise.all(params.files.map(async file => {
				const oldUri = URI.parse(file.oldUri);
				const newUri = URI.parse(file.newUri);
				return await worker(oldUri, token, languageService => {
					return languageService.getFileRenameEdits(oldUri, newUri, token) ?? null;
				}) ?? null;
			}));
			const edits = _edits.filter((edit): edit is NonNullable<typeof edit> => !!edit);
			if (edits.length) {
				mergeWorkspaceEdits(edits[0], ...edits.slice(1));
				return edits[0];
			}
			return null;
		});
	}
	if (experimental?.autoInsertionProvider) {
		server.connection.onRequest(AutoInsertRequest.type, async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getAutoInsertSnippet(uri, params.selection, params.change, token);
			});
		});
	}
	if (experimental?.fileReferencesProvider) {
		server.connection.onRequest(FindFileReferenceRequest.type, async (params, token) => {
			const uri = URI.parse(params.textDocument.uri);
			return await worker(uri, token, languageService => {
				return languageService.getFileReferences(uri, token);
			});
		});
	}

	function worker<T>(uri: URI, token: vscode.CancellationToken, cb: (languageService: LanguageService) => T) {
		return new Promise<T | undefined>(resolve => {
			const timeout = setTimeout(async () => {
				clearTimeout(timeout);
				if (token.isCancellationRequested) {
					resolve(undefined);
					return;
				}
				const languageService = (await server.project.getLanguageService(decodeEmbeddedDocumentUri(uri)?.[0] ?? uri));
				const result = await cb(languageService);
				if (token.isCancellationRequested) {
					resolve(undefined);
					return;
				}
				resolve(result);
			}, 0);
		});
	}

	function fixTextEdit(item: vscode.CompletionItem) {
		const insertReplaceSupport = server.initializeParams?.capabilities.textDocument?.completion?.completionItem?.insertReplaceSupport ?? false;
		if (!insertReplaceSupport) {
			if (item.textEdit && vscode.InsertReplaceEdit.is(item.textEdit)) {
				item.textEdit = vscode.TextEdit.replace(item.textEdit.insert, item.textEdit.newText);
			}
		}
	}
}

export function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
