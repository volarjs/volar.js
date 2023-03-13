import * as embedded from '@volar/language-service';
import * as vscode from 'vscode-languageserver';
import { AutoInsertRequest, FindFileReferenceRequest } from '../../protocol';
import { CancellationTokenHost } from '../cancellationPipe';
import type { Workspaces } from '../workspaces';
import { RuntimeEnvironment, LanguageServerInitializationOptions, ServerMode } from '../../types';
import { createDocuments } from '../documents';

export function register(
	connection: vscode.Connection,
	projects: Workspaces,
	initParams: vscode.InitializeParams,
	initOptions: LanguageServerInitializationOptions,
	cancelHost: CancellationTokenHost,
	semanticTokensLegend: vscode.SemanticTokensLegend,
	runtime: RuntimeEnvironment,
	documents: ReturnType<typeof createDocuments>,
) {

	let lastCompleteUri: string;
	let lastCompleteLs: embedded.LanguageService;
	let lastCodeLensLs: embedded.LanguageService;
	let lastCodeActionLs: embedded.LanguageService;
	let lastCallHierarchyLs: embedded.LanguageService;

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
			const document = documents.data.uriGet(params.textDocument.uri)?.getDocument();
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
		return worker(params.textDocument.uri, token, service => {
			return service.prepareRename(params.textDocument.uri, params.position, token);
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
			return service.findReferences(params.textDocument.uri, params.position, token);
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
			return service.findDocumentLinks(params.textDocument.uri, token);
		});
	});
	connection.onWorkspaceSymbol(async (params, token) => {

		let results: vscode.WorkspaceSymbol[] = [];

		for (const _workspace of projects.workspaces.values()) {
			const workspace = await _workspace;
			let projects = [...workspace.projects.values()];
			projects = projects.length ? projects : [workspace.getInferredProject()];
			for (const project of projects) {

				if (token.isCancellationRequested)
					return;

				const service = (await project).getLanguageService();

				results = results.concat(await service.findWorkspaceSymbols(params.query, token));
			}
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
			const tsToken = cancelHost.createCancellationToken(token);
			const mode = initOptions.serverMode === ServerMode.PartialSemantic ? 'semantic' as const
				: initOptions.serverMode === ServerMode.Syntactic ? 'syntactic' as const
					: 'all' as const;
			return service.doValidation(
				params.textDocument.uri,
				mode,
				tsToken,
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
			return service.getInlayHints(params.textDocument.uri, params.range, token);
		});
	});
	// TODO: connection.languages.inlayHint.resolve
	connection.workspace.onWillRenameFiles(async (params, token) => {

		const config = await connection.workspace.getConfiguration('volar.updateImportsOnFileMove.enabled');
		if (!config) {
			return null;
		}

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
			return service.doAutoInsert(params.textDocument.uri, params.position, params.options, token);
		});
	});

	function worker<T>(uri: string, token: embedded.CancellationToken, cb: (service: embedded.LanguageService) => T) {
		return new Promise<T | undefined>(resolve => {
			runtime.timer.setImmediate(async () => {
				if (token.isCancellationRequested) {
					resolve(undefined);
					return;
				}
				const service = await getLanguageService(uri);
				if (service) {
					try { // handle TS cancel throw
						const result = await cb(service);
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
				}
				else {
					resolve(undefined);
				}
			});
		});
	}
	async function getLanguageService(uri: string) {
		const project = (await projects.getProject(uri))?.project;
		return project?.getLanguageService();
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
