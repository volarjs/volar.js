import * as embedded from '@volar/language-service';
import type { SnapshotDocument } from '@volar/snapshot-document';
import * as vscode from 'vscode-languageserver';
import { AutoInsertRequest, FindFileReferenceRequest } from '../../protocol';
import type { InitializationOptions, ServerProjectProvider, ServerRuntimeEnvironment } from '../types';

export function registerLanguageFeatures(
	connection: vscode.Connection,
	projectProvider: ServerProjectProvider,
	initParams: vscode.InitializeParams,
	initOptions: InitializationOptions,
	semanticTokensLegend: vscode.SemanticTokensLegend,
	runtime: ServerRuntimeEnvironment,
	documents: vscode.TextDocuments<SnapshotDocument>,
) {

	let lastCompleteUri: string;
	let lastCompleteLs: embedded.LanguageService;
	let lastCodeLensLs: embedded.LanguageService;
	let lastCodeActionLs: embedded.LanguageService;
	let lastCallHierarchyLs: embedded.LanguageService;
	let lastDocumentLinkLs: embedded.LanguageService;
	let lastInlayHintLs: embedded.LanguageService;

	connection.onDocumentFormatting(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.format(params.textDocument.uri, params.options, undefined, undefined, token);
		});
	});
	connection.onDocumentRangeFormatting(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.format(params.textDocument.uri, params.options, params.range, undefined, token);
		});
	});
	connection.onDocumentOnTypeFormatting(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.format(params.textDocument.uri, params.options, undefined, params, token);
		});
	});
	connection.onSelectionRanges(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.getSelectionRanges(params.textDocument.uri, params.positions, token);
		});
	});
	connection.onFoldingRanges(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.getFoldingRanges(params.textDocument.uri, token);
		});
	});
	connection.languages.onLinkedEditingRange(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findLinkedEditingRanges(params.textDocument.uri, params.position, token);
		});
	});
	connection.onDocumentSymbol(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findDocumentSymbols(params.textDocument.uri, token);
		});
	});
	connection.onDocumentColor(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findDocumentColors(params.textDocument.uri, token);
		});
	});
	connection.onColorPresentation(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.getColorPresentations(params.textDocument.uri, params.color, params.range, token);
		});
	});

	connection.onCompletion(async (params, token) => {
		return worker(params.textDocument.uri, token, async service => {
			lastCompleteUri = params.textDocument.uri;
			lastCompleteLs = service;
			const document = documents.get(params.textDocument.uri);
			const list = await service.doComplete(
				params.textDocument.uri,
				params.position,
				params.context,
				token,
			);
			for (const item of list.items) {
				fixTextEdit(item);
			}
			if (!initOptions.fullCompletionList && document) {
				list.items = list.items.filter(item => {
					const range = item.textEdit ? (
						vscode.InsertReplaceEdit.is(item.textEdit)
							? item.textEdit.replace
							: item.textEdit.range
					) : list.itemDefaults?.editRange ? (
						vscode.Range.is(list.itemDefaults.editRange)
							? list.itemDefaults.editRange
							: list.itemDefaults.editRange.replace
					) : undefined;
					if (range) {
						const sourceText = document.getText(range).toLowerCase();
						if (sourceText.trim()) {
							let filterText = (item.filterText ?? item.label).toLowerCase();
							for (const char of sourceText) {
								const index = filterText.indexOf(char);
								if (index === -1) {
									return false;
								}
								filterText = filterText.slice(index + 1);
							}
						}
					}
					return true;
				});
			}
			return list;
		});
	});
	connection.onCompletionResolve(async (item, token) => {
		if (lastCompleteUri && lastCompleteLs) {
			item = await lastCompleteLs.doCompletionResolve(item, token);
			fixTextEdit(item);
		}
		return item;
	});
	connection.onHover(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.doHover(params.textDocument.uri, params.position, token);
		});
	});
	connection.onSignatureHelp(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.getSignatureHelp(params.textDocument.uri, params.position, params.context, token);
		});
	});
	connection.onPrepareRename(async (params, token) => {
		return worker(params.textDocument.uri, token, async service => {
			const result = await service.prepareRename(params.textDocument.uri, params.position, token);
			if (result && 'message' in result) {
				return new vscode.ResponseError(0, result.message);
			}
			return result;
		});
	});
	connection.onRenameRequest(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.doRename(params.textDocument.uri, params.position, params.newName, token);
		});
	});
	connection.onCodeLens(async (params, token) => {
		return worker(params.textDocument.uri, token, async service => {
			lastCodeLensLs = service;
			return service.doCodeLens(params.textDocument.uri, token);
		});
	});
	connection.onCodeLensResolve(async (codeLens, token) => {
		return await lastCodeLensLs?.doCodeLensResolve(codeLens, token) ?? codeLens;
	});
	connection.onCodeAction(async (params, token) => {
		return worker(params.textDocument.uri, token, async service => {
			lastCodeActionLs = service;
			let codeActions = await service.doCodeActions(params.textDocument.uri, params.range, params.context, token) ?? [];
			for (const codeAction of codeActions) {
				if (codeAction.data && typeof codeAction.data === 'object') {
					(codeAction.data as any).uri = params.textDocument.uri;
				}
				else {
					codeAction.data = { uri: params.textDocument.uri };
				}
			}
			if (!initParams.capabilities.textDocument?.codeAction?.disabledSupport) {
				codeActions = codeActions.filter(codeAction => !codeAction.disabled);
			}
			return codeActions;
		});
	});
	connection.onCodeActionResolve(async (codeAction, token) => {
		return await lastCodeActionLs.doCodeActionResolve(codeAction, token) ?? codeAction;
	});
	connection.onReferences(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findReferences(params.textDocument.uri, params.position, { includeDeclaration: true }, token);
		});
	});
	connection.onRequest(FindFileReferenceRequest.type, async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findFileReferences(params.textDocument.uri, token);
		});
	});
	connection.onImplementation(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findImplementations(params.textDocument.uri, params.position, token);
		});
	});
	connection.onDefinition(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findDefinition(params.textDocument.uri, params.position, token);
		});
	});
	connection.onTypeDefinition(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findTypeDefinition(params.textDocument.uri, params.position, token);
		});
	});
	connection.onDocumentHighlight(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findDocumentHighlights(params.textDocument.uri, params.position, token);
		});
	});
	connection.onDocumentLinks(async (params, token) => {
		return await worker(params.textDocument.uri, token, service => {
			lastDocumentLinkLs = service;
			return service.findDocumentLinks(params.textDocument.uri, token);
		});
	});
	connection.onDocumentLinkResolve(async (link, token) => {
		return await lastDocumentLinkLs.doDocumentLinkResolve(link, token);
	});
	connection.onWorkspaceSymbol(async (params, token) => {

		let results: vscode.WorkspaceSymbol[] = [];

		for (const project of await projectProvider.getProjects()) {

			if (token.isCancellationRequested) {
				return;
			}

			results = results.concat(await project.getLanguageService().findWorkspaceSymbols(params.query, token));
		}

		return results;
	});
	connection.languages.callHierarchy.onPrepare(async (params, token) => {
		return await worker(params.textDocument.uri, token, async service => {
			lastCallHierarchyLs = service;
			return service.callHierarchy.doPrepare(params.textDocument.uri, params.position, token);
		}) ?? [];
	});
	connection.languages.callHierarchy.onIncomingCalls(async (params, token) => {
		return await lastCallHierarchyLs?.callHierarchy.getIncomingCalls(params.item, token) ?? [];
	});
	connection.languages.callHierarchy.onOutgoingCalls(async (params, token) => {
		return await lastCallHierarchyLs?.callHierarchy.getOutgoingCalls(params.item, token) ?? [];
	});
	connection.languages.semanticTokens.on(async (params, token, _, resultProgress) => {
		await sleep(200);
		return await worker(params.textDocument.uri, token, async service => {
			return await service?.getSemanticTokens(
				params.textDocument.uri,
				undefined,
				semanticTokensLegend,
				token,
				tokens => resultProgress?.report(tokens),
			);
		}) ?? { data: [] };
	});
	connection.languages.semanticTokens.onRange(async (params, token, _, resultProgress) => {
		await sleep(200);
		return await worker(params.textDocument.uri, token, async service => {
			return await service?.getSemanticTokens(
				params.textDocument.uri,
				params.range,
				semanticTokensLegend,
				token,
				tokens => resultProgress?.report(tokens),
			);
		}) ?? { data: [] };
	});
	connection.languages.diagnostics.on(async (params, token, _workDoneProgressReporter, resultProgressReporter) => {
		const result = await worker(params.textDocument.uri, token, service => {
			return service.doValidation(
				params.textDocument.uri,
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
	connection.languages.inlayHint.on(async (params, token) => {
		return worker(params.textDocument.uri, token, async service => {
			lastInlayHintLs = service;
			return service.getInlayHints(params.textDocument.uri, params.range, token);
		});
	});
	connection.languages.inlayHint.resolve(async (hint, token) => {
		return await lastInlayHintLs.doInlayHintResolve(hint, token);
	});
	connection.workspace.onWillRenameFiles(async (params, token) => {

		const _edits = await Promise.all(params.files.map(async (file) => {
			return await worker(file.oldUri, token, service => {
				return service.getEditsForFileRename(file.oldUri, file.newUri, token) ?? null;
			}) ?? null;
		}));
		const edits = _edits.filter((edit): edit is NonNullable<typeof edit> => !!edit);

		if (edits.length) {
			embedded.mergeWorkspaceEdits(edits[0], ...edits.slice(1));
			return edits[0];
		}

		return null;
	});
	connection.onRequest(AutoInsertRequest.type, async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.doAutoInsert(params.textDocument.uri, params.position, params.lastChange, token);
		});
	});

	function worker<T>(uri: string, token: embedded.CancellationToken, cb: (service: embedded.LanguageService) => T) {
		return new Promise<T | undefined>(resolve => {
			runtime.timer.setImmediate(async () => {
				if (token.isCancellationRequested) {
					resolve(undefined);
					return;
				}
				const languageService = (await projectProvider.getProject(uri)).getLanguageService();
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
			});
		});
	}
	function fixTextEdit(item: vscode.CompletionItem) {
		const insertReplaceSupport = initParams.capabilities.textDocument?.completion?.completionItem?.insertReplaceSupport ?? false;
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
