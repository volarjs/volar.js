import * as embedded from '@volar/language-service';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { AutoInsertRequest, FindFileReferenceRequest } from '../../protocol';
import type { ServerBase } from '../types';

export function registerLanguageFeatures(server: ServerBase) {
	let lastCompleteUri: string;
	let lastCompleteLs: embedded.LanguageService;
	let lastCodeLensLs: embedded.LanguageService;
	let lastCodeActionLs: embedded.LanguageService;
	let lastCallHierarchyLs: embedded.LanguageService;
	let lastDocumentLinkLs: embedded.LanguageService;
	let lastInlayHintLs: embedded.LanguageService;

	server.connection.onDocumentFormatting(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.format(uri, params.options, undefined, undefined, token);
		});
	});
	server.connection.onDocumentRangeFormatting(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.format(uri, params.options, params.range, undefined, token);
		});
	});
	server.connection.onDocumentOnTypeFormatting(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.format(uri, params.options, undefined, params, token);
		});
	});
	server.connection.onSelectionRanges(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.getSelectionRanges(uri, params.positions, token);
		});
	});
	server.connection.onFoldingRanges(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.getFoldingRanges(uri, token);
		});
	});
	server.connection.languages.onLinkedEditingRange(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.findLinkedEditingRanges(uri, params.position, token);
		});
	});
	server.connection.onDocumentSymbol(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.findDocumentSymbols(uri, token);
		});
	});
	server.connection.onDocumentColor(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.findDocumentColors(uri, token);
		});
	});
	server.connection.onColorPresentation(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.getColorPresentations(uri, params.color, params.range, token);
		});
	});

	server.connection.onCompletion(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, async service => {
			lastCompleteUri = params.textDocument.uri;
			lastCompleteLs = service;
			const list = await service.doComplete(
				uri,
				params.position,
				params.context,
				token,
			);
			for (const item of list.items) {
				fixTextEdit(item);
			}
			return list;
		});
	});
	server.connection.onCompletionResolve(async (item, token) => {
		if (lastCompleteUri && lastCompleteLs) {
			item = await lastCompleteLs.doCompletionResolve(item, token);
			fixTextEdit(item);
		}
		return item;
	});
	server.connection.onHover(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.doHover(uri, params.position, token);
		});
	});
	server.connection.onSignatureHelp(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.getSignatureHelp(uri, params.position, params.context, token);
		});
	});
	server.connection.onPrepareRename(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, async service => {
			const result = await service.prepareRename(uri, params.position, token);
			if (result && 'message' in result) {
				return new vscode.ResponseError(0, result.message);
			}
			return result;
		});
	});
	server.connection.onRenameRequest(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.doRename(uri, params.position, params.newName, token);
		});
	});
	server.connection.onCodeLens(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, async service => {
			lastCodeLensLs = service;
			return service.doCodeLens(uri, token);
		});
	});
	server.connection.onCodeLensResolve(async (codeLens, token) => {
		return await lastCodeLensLs?.doCodeLensResolve(codeLens, token) ?? codeLens;
	});
	server.connection.onCodeAction(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, async service => {
			lastCodeActionLs = service;
			let codeActions = await service.doCodeActions(uri, params.range, params.context, token) ?? [];
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
		return await lastCodeActionLs.doCodeActionResolve(codeAction, token) ?? codeAction;
	});
	server.connection.onReferences(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.findReferences(uri, params.position, { includeDeclaration: true }, token);
		});
	});
	server.connection.onRequest(FindFileReferenceRequest.type, async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.findFileReferences(uri, token);
		});
	});
	server.connection.onImplementation(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.findImplementations(uri, params.position, token);
		});
	});
	server.connection.onDefinition(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.findDefinition(uri, params.position, token);
		});
	});
	server.connection.onTypeDefinition(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.findTypeDefinition(uri, params.position, token);
		});
	});
	server.connection.onDocumentHighlight(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, service => {
			return service.findDocumentHighlights(uri, params.position, token);
		});
	});
	server.connection.onDocumentLinks(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, service => {
			lastDocumentLinkLs = service;
			return service.findDocumentLinks(uri, token);
		});
	});
	server.connection.onDocumentLinkResolve(async (link, token) => {
		return await lastDocumentLinkLs.doDocumentLinkResolve(link, token);
	});
	server.connection.onWorkspaceSymbol(async (params, token) => {
		let results: vscode.WorkspaceSymbol[] = [];
		for (const project of await server.projects.all.call(server)) {
			if (token.isCancellationRequested) {
				return;
			}
			results = results.concat(await project.getLanguageService().findWorkspaceSymbols(params.query, token));
		}
		return results;
	});
	server.connection.languages.callHierarchy.onPrepare(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, async service => {
			lastCallHierarchyLs = service;
			return service.callHierarchy.doPrepare(uri, params.position, token);
		}) ?? [];
	});
	server.connection.languages.callHierarchy.onIncomingCalls(async (params, token) => {
		return await lastCallHierarchyLs?.callHierarchy.getIncomingCalls(params.item, token) ?? [];
	});
	server.connection.languages.callHierarchy.onOutgoingCalls(async (params, token) => {
		return await lastCallHierarchyLs?.callHierarchy.getOutgoingCalls(params.item, token) ?? [];
	});
	server.connection.languages.semanticTokens.on(async (params, token, _, resultProgress) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, async service => {
			return await service?.getSemanticTokens(
				uri,
				undefined,
				server.initializeResult.capabilities.semanticTokensProvider!.legend,
				token,
				tokens => resultProgress?.report(tokens),
			);
		}) ?? { data: [] };
	});
	server.connection.languages.semanticTokens.onRange(async (params, token, _, resultProgress) => {
		const uri = URI.parse(params.textDocument.uri);
		return await worker(uri, token, async service => {
			return await service?.getSemanticTokens(
				uri,
				params.range,
				server.initializeResult.capabilities.semanticTokensProvider!.legend,
				token,
				tokens => resultProgress?.report(tokens),
			);
		}) ?? { data: [] };
	});
	server.connection.languages.diagnostics.on(async (params, token, _workDoneProgressReporter, resultProgressReporter) => {
		const uri = URI.parse(params.textDocument.uri);
		const result = await worker(uri, token, service => {
			return service.doValidation(
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
				},
			);
		});
		return {
			kind: vscode.DocumentDiagnosticReportKind.Full,
			items: result ?? [],
		};
	});
	server.connection.languages.inlayHint.on(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		return worker(uri, token, async service => {
			lastInlayHintLs = service;
			return service.getInlayHints(uri, params.range, token);
		});
	});
	server.connection.languages.inlayHint.resolve(async (hint, token) => {
		return await lastInlayHintLs.doInlayHintResolve(hint, token);
	});
	server.connection.workspace.onWillRenameFiles(async (params, token) => {
		const _edits = await Promise.all(params.files.map(async file => {
			const oldUri = URI.parse(file.oldUri);
			const newUri = URI.parse(file.newUri);
			return await worker(oldUri, token, service => {
				return service.getEditsForFileRename(oldUri, newUri, token) ?? null;
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
		return worker(uri, token, service => {
			return service.doAutoInsert(uri, params.selection, params.change, token);
		});
	});

	function worker<T>(uri: URI, token: embedded.CancellationToken, cb: (service: embedded.LanguageService) => T) {
		return new Promise<T | undefined>(resolve => {
			const timeout = setTimeout(async () => {
				clearTimeout(timeout);
				if (token.isCancellationRequested) {
					resolve(undefined);
					return;
				}
				const languageService = (await server.projects.get.call(server, uri)).getLanguageService();
				try { // handle TS cancel throw
					const result = await cb(languageService);
					if (token.isCancellationRequested) {
						resolve(undefined);
						return;
					}
					resolve(result);
				}
				catch {
					resolve(undefined);
					return;
				}
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
