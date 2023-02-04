import * as embedded from '@volar/language-service';
import * as vscode from 'vscode-languageserver';
import { AutoInsertRequest, FindFileReferenceRequest, ShowReferencesNotification } from '../../protocol';
import { CancellationTokenHost } from '../cancellationPipe';
import type { Workspaces } from '../workspaces';
import * as shared from '@volar/shared';
import { RuntimeEnvironment } from '../../types';

export function register(
	connection: vscode.Connection,
	projects: Workspaces,
	initParams: vscode.InitializeParams,
	cancelHost: CancellationTokenHost,
	semanticTokensLegend: vscode.SemanticTokensLegend,
	runtime: RuntimeEnvironment,
) {

	let lastCompleteUri: string;
	let lastCompleteLs: embedded.LanguageService;
	let lastCodeLensLs: embedded.LanguageService;
	let lastCodeActionLs: embedded.LanguageService;
	let lastCallHierarchyLs: embedded.LanguageService;

	connection.onDocumentFormatting(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.format(params.textDocument.uri, params.options);
		});
	});
	connection.onDocumentRangeFormatting(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.format(params.textDocument.uri, params.options, params.range);
		});
	});
	connection.onDocumentOnTypeFormatting(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.format(params.textDocument.uri, params.options, undefined, params);
		});
	});
	connection.onSelectionRanges(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.getSelectionRanges(params.textDocument.uri, params.positions);
		});
	});
	connection.onFoldingRanges(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.getFoldingRanges(params.textDocument.uri);
		});
	});
	connection.languages.onLinkedEditingRange(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findLinkedEditingRanges(params.textDocument.uri, params.position);
		});
	});
	connection.onDocumentSymbol(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findDocumentSymbols(params.textDocument.uri);
		});
	});
	connection.onDocumentColor(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findDocumentColors(params.textDocument.uri);
		});
	});
	connection.onColorPresentation(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.getColorPresentations(params.textDocument.uri, params.color, params.range);
		});
	});

	connection.onCompletion(async (params, token) => {
		return worker(params.textDocument.uri, token, async service => {
			lastCompleteUri = params.textDocument.uri;
			lastCompleteLs = service;
			const list = await service.doComplete(
				params.textDocument.uri,
				params.position,
				params.context,
			);
			if (list) {
				for (const item of list.items) {
					fixTextEdit(item);
				}
			}
			return list;
		});
	});
	connection.onCompletionResolve(async (item) => {
		if (lastCompleteUri && lastCompleteLs) {
			item = await lastCompleteLs.doCompletionResolve(item);
			fixTextEdit(item);
		}
		return item;
	});
	connection.onHover(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.doHover(params.textDocument.uri, params.position);
		});
	});
	connection.onSignatureHelp(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.getSignatureHelp(params.textDocument.uri, params.position, params.context);
		});
	});
	connection.onPrepareRename(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.prepareRename(params.textDocument.uri, params.position);
		});
	});
	connection.onRenameRequest(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.doRename(params.textDocument.uri, params.position, params.newName);
		});
	});
	connection.onCodeLens(async (params, token) => {
		return worker(params.textDocument.uri, token, async service => {
			lastCodeLensLs = service;
			return service.doCodeLens(params.textDocument.uri);
		});
	});
	connection.onCodeLensResolve(async (codeLens) => {
		return await lastCodeLensLs?.doCodeLensResolve(codeLens) ?? codeLens;
	});
	connection.onExecuteCommand(async (params) => {
		if (
			params.command === embedded.showReferencesCommand
			&& params.arguments
		) {

			const args = params.arguments as embedded.ShowReferencesCommandData;

			await connection.sendNotification(ShowReferencesNotification.type, {
				textDocument: {
					uri: args[0],
				},
				position: args[1],
				references: args[2],
			});
		}
	});
	connection.onCodeAction(async (params, token) => {
		return worker(params.textDocument.uri, token, async service => {
			lastCodeActionLs = service;
			let codeActions = await service.doCodeActions(params.textDocument.uri, params.range, params.context) ?? [];
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
	connection.onCodeActionResolve(async (codeAction) => {
		return await lastCodeActionLs.doCodeActionResolve(codeAction) ?? codeAction;
	});
	connection.onReferences(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findReferences(params.textDocument.uri, params.position);
		});
	});
	connection.onRequest(FindFileReferenceRequest.type, async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findFileReferences(params.textDocument.uri);
		});
	});
	connection.onImplementation(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findImplementations(params.textDocument.uri, params.position);
		});
	});
	connection.onDefinition(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findDefinition(params.textDocument.uri, params.position);
		});
	});
	connection.onTypeDefinition(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findTypeDefinition(params.textDocument.uri, params.position);
		});
	});
	connection.onDocumentHighlight(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findDocumentHighlights(params.textDocument.uri, params.position);
		});
	});
	connection.onDocumentLinks(async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.findDocumentLinks(params.textDocument.uri);
		});
	});
	connection.onWorkspaceSymbol(async (params, token) => {

		let results: vscode.SymbolInformation[] = [];

		for (const _workspace of projects.workspaces.values()) {
			const workspace = await _workspace;
			let projects = [...workspace.projects.values()];
			projects = projects.length ? projects : [workspace.getInferredProject()];
			for (const project of projects) {

				if (token.isCancellationRequested)
					return;

				const service = (await project).getLanguageService();

				results = results.concat(await service.findWorkspaceSymbols(params.query));
			}
		}

		return results;
	});
	connection.languages.callHierarchy.onPrepare(async (params, token) => {
		return await worker(params.textDocument.uri, token, async service => {
			lastCallHierarchyLs = service;
			return service.callHierarchy.doPrepare(params.textDocument.uri, params.position);
		}) ?? [];
	});
	connection.languages.callHierarchy.onIncomingCalls(async (params) => {
		return await lastCallHierarchyLs?.callHierarchy.getIncomingCalls(params.item) ?? [];
	});
	connection.languages.callHierarchy.onOutgoingCalls(async (params) => {
		return await lastCallHierarchyLs?.callHierarchy.getOutgoingCalls(params.item) ?? [];
	});
	connection.languages.semanticTokens.on(async (params, token, _, resultProgress) => {
		await shared.sleep(200);
		return await worker(params.textDocument.uri, token, async service => {

			const result = await service?.getSemanticTokens(
				params.textDocument.uri,
				undefined,
				semanticTokensLegend,
				token,
				tokens => resultProgress?.report(buildTokens(tokens)),
			) ?? [];

			return buildTokens(result);
		}) ?? buildTokens([]);
	});
	connection.languages.semanticTokens.onRange(async (params, token, _, resultProgress) => {
		await shared.sleep(200);
		return await worker(params.textDocument.uri, token, async service => {

			const result = await service?.getSemanticTokens(
				params.textDocument.uri,
				params.range,
				semanticTokensLegend,
				token,
				tokens => resultProgress?.report(buildTokens(tokens)),
			) ?? [];

			return buildTokens(result);
		}) ?? buildTokens([]);
	});
	connection.languages.diagnostics.on(async (params, token, _workDoneProgressReporter, resultProgressReporter) => {
		const result = await worker(params.textDocument.uri, token, service => {
			const tsToken = cancelHost.createCancellationToken(token);
			return service.doValidation(params.textDocument.uri, tsToken, errors => {
				// resultProgressReporter is undefined in vscode
				resultProgressReporter?.report({
					relatedDocuments: {
						[params.textDocument.uri]: {
							kind: vscode.DocumentDiagnosticReportKind.Full,
							items: errors,
						},
					},
				});
			});
		});
		return {
			kind: vscode.DocumentDiagnosticReportKind.Full,
			items: result ?? [],
		};
	});
	connection.languages.inlayHint.on(async (params, token) => {
		return worker(params.textDocument.uri, token, async service => {
			return service.getInlayHints(params.textDocument.uri, params.range);
		});
	});
	// TODO: connection.languages.inlayHint.resolve
	connection.workspace.onWillRenameFiles(async (params, token) => {

		const config = await connection.workspace.getConfiguration('volar.updateImportsOnFileMove.enabled');
		if (!config) {
			return null;
		}

		const _edits = await Promise.all(params.files.map(async file => {
			return await worker(file.oldUri, token, service => {
				return service.getEditsForFileRename(file.oldUri, file.newUri) ?? null;
			}) ?? null;
		}));
		const edits = _edits.filter(shared.notEmpty);

		if (edits.length) {
			embedded.mergeWorkspaceEdits(edits[0], ...edits.slice(1));
			return edits[0];
		}

		return null;
	});
	connection.onRequest(AutoInsertRequest.type, async (params, token) => {
		return worker(params.textDocument.uri, token, service => {
			return service.doAutoInsert(params.textDocument.uri, params.position, params.options);
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
	function buildTokens(tokens: embedded.SemanticToken[]) {
		const builder = new vscode.SemanticTokensBuilder();
		const sortedTokens = tokens.sort((a, b) => a[0] - b[0] === 0 ? a[1] - b[1] : a[0] - b[0]);
		for (const token of sortedTokens) {
			builder.push(...token);
		}
		return builder.build();
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
