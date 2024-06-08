import * as embedded from '@volar/language-service';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { AutoInsertRequest, FindFileReferenceRequest } from '../../protocol';
import type { LanguageServer } from '../types';

export function registerLanguageFeatures(server: LanguageServer) {
	let lastCompleteUri: string;
	let lastCompleteLs: embedded.LanguageService | undefined;
	let lastCodeLensLs: embedded.LanguageService | undefined;
	let lastCodeActionLs: embedded.LanguageService | undefined;
	let lastCallHierarchyLs: embedded.LanguageService | undefined;
	let lastDocumentLinkLs: embedded.LanguageService | undefined;
	let lastInlayHintLs: embedded.LanguageService | undefined;

	server.connection.onDocumentFormatting(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getDocumentFormattingEdits(uri, params.options, undefined, undefined, token);
		});
	});
	server.connection.onDocumentRangeFormatting(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getDocumentFormattingEdits(uri, params.options, params.range, undefined, token);
		});
	});
	server.connection.onDocumentOnTypeFormatting(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getDocumentFormattingEdits(uri, params.options, undefined, params, token);
		});
	});
	server.connection.onSelectionRanges(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getSelectionRanges(uri, params.positions, token);
		});
	});
	server.connection.onFoldingRanges(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getFoldingRanges(uri, token);
		});
	});
	server.connection.languages.onLinkedEditingRange(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getLinkedEditingRanges(uri, params.position, token);
		});
	});
	server.connection.onDocumentSymbol(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getDocumentSymbols(uri, token);
		});
	});
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
	server.connection.onCompletionResolve(async (item, token) => {
		if (lastCompleteUri && lastCompleteLs) {
			item = await lastCompleteLs.resolveCompletionItem(item, token);
			fixTextEdit(item);
		}
		return item;
	});
	server.connection.onHover(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getHover(uri, params.position, token);
		});
	});
	server.connection.onSignatureHelp(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getSignatureHelp(uri, params.position, params.context, token);
		});
	});
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
	server.connection.onRenameRequest(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getRenameEdits(uri, params.position, params.newName, token);
		});
	});
	server.connection.onCodeLens(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			lastCodeLensLs = languageService;
			return languageService.getCodeLenses(uri, token);
		});
	});
	server.connection.onCodeLensResolve(async (codeLens, token) => {
		return await lastCodeLensLs?.resolveCodeLens(codeLens, token) ?? codeLens;
	});
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
	server.connection.onCodeActionResolve(async (codeAction, token) => {
		return await lastCodeActionLs?.resolveCodeAction(codeAction, token) ?? codeAction;
	});
	server.connection.onReferences(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getReferences(uri, params.position, { includeDeclaration: true }, token);
		});
	});
	server.connection.onRequest(FindFileReferenceRequest.type, async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getFileReferences(uri, token);
		});
	});
	server.connection.onImplementation(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getImplementations(uri, params.position, token);
		});
	});
	server.connection.onDefinition(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getDefinition(uri, params.position, token);
		});
	});
	server.connection.onTypeDefinition(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getTypeDefinition(uri, params.position, token);
		});
	});
	server.connection.onDocumentHighlight(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getDocumentHighlights(uri, params.position, token);
		});
	});
	server.connection.onDocumentLinks(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			lastDocumentLinkLs = languageService;
			return languageService.getDocumentLinks(uri, token);
		});
	});
	server.connection.onDocumentLinkResolve(async (link, token) => {
		return await lastDocumentLinkLs?.resolveDocumentLink(link, token);
	});
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
	// TODO: onWorkspaceSymbolResolve
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
	server.connection.languages.diagnostics.onWorkspace(async (_params, token) => {
		const items: embedded.WorkspaceDocumentDiagnosticReport[] = [];
		for (const languageService of await server.project.getExistingLanguageServices()) {
			if (token.isCancellationRequested) {
				break;
			}
			const result = await languageService.getWorkspaceDiagnostics(token);
			items.push(...result);
		}
		return { items };
	});
	server.connection.languages.inlayHint.on(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			lastInlayHintLs = languageService;
			return languageService.getInlayHints(uri, params.range, token);
		});
	});
	server.connection.languages.inlayHint.resolve(async (hint, token) => {
		return await lastInlayHintLs?.resolveInlayHint(hint, token) ?? hint;
	});
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
			embedded.mergeWorkspaceEdits(edits[0], ...edits.slice(1));
			return edits[0];
		}
		return null;
	});
	server.connection.onRequest(AutoInsertRequest.type, async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, languageService => {
			return languageService.getAutoInsertSnippet(uri, params.selection, params.change, token);
		});
	});

	function worker<T>(uri: URI, token: embedded.CancellationToken, cb: (languageService: embedded.LanguageService) => T) {
		return new Promise<T | undefined>(resolve => {
			const timeout = setTimeout(async () => {
				clearTimeout(timeout);
				if (token.isCancellationRequested) {
					resolve(undefined);
					return;
				}
				const languageService = (await server.project.getLanguageService(uri));
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
