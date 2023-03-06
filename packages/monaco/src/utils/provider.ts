import { LanguageService, standardSemanticTokensLegend } from '@volar/language-service';
import type { editor, languages, Uri } from 'monaco-editor-core';
import * as vscode from 'vscode-languageserver-protocol';
import { markers } from './markers';
import * as monaco2protocol from './monaco2protocol';
import * as protocol2monaco from './protocol2monaco';

export async function createLanguageFeaturesProvider(
	worker: editor.MonacoWebWorker<LanguageService>,
	getSyncUris: () => Uri[],
): Promise<
	languages.HoverProvider &
	languages.DocumentSymbolProvider &
	languages.DocumentHighlightProvider &
	languages.LinkedEditingRangeProvider &
	languages.DefinitionProvider &
	languages.TypeDefinitionProvider &
	languages.ImplementationProvider &
	languages.CodeLensProvider &
	languages.CodeActionProvider &
	languages.DocumentFormattingEditProvider &
	languages.DocumentRangeFormattingEditProvider &
	languages.OnTypeFormattingEditProvider &
	languages.LinkProvider &
	languages.CompletionItemProvider &
	languages.DocumentColorProvider &
	languages.FoldingRangeProvider &
	languages.DeclarationProvider &
	languages.SignatureHelpProvider &
	languages.RenameProvider &
	languages.ReferenceProvider &
	languages.SelectionRangeProvider &
	languages.InlayHintsProvider &
	languages.DocumentSemanticTokensProvider &
	languages.DocumentRangeSemanticTokensProvider
> {

	const completionItems = new WeakMap<languages.CompletionItem, vscode.CompletionItem>();
	const codeLens = new WeakMap<languages.CodeLens, vscode.CodeLens>();
	const codeActions = new WeakMap<languages.CodeAction, vscode.CodeAction>();
	const colorInfos = new WeakMap<languages.IColorInformation, vscode.ColorInformation>();
	const languageService = await worker.getProxy();

	return {

		triggerCharacters: await (languageService.triggerCharacters as unknown as () => Promise<typeof languageService.triggerCharacters>)(),
		autoFormatTriggerCharacters: await (languageService.triggerCharacters as unknown as () => Promise<typeof languageService.autoFormatTriggerCharacters>)(),
		signatureHelpTriggerCharacters: await (languageService.triggerCharacters as unknown as () => Promise<typeof languageService.signatureHelpTriggerCharacters>)(),
		signatureHelpRetriggerCharacters: await (languageService.triggerCharacters as unknown as () => Promise<typeof languageService.signatureHelpRetriggerCharacters>)(),

		getLegend() {
			return standardSemanticTokensLegend;
		},
		async provideDocumentSemanticTokens(model, _lastResultId) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getSemanticTokens(
				model.uri.toString(),
				undefined,
				standardSemanticTokensLegend,
			);
			if (codeResult) {
				return {
					resultId: codeResult.resultId,
					data: Uint32Array.from(codeResult.data),
				};
			}
		},
		async provideDocumentRangeSemanticTokens(model, range) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getSemanticTokens(model.uri.toString(), monaco2protocol.asRange(range), standardSemanticTokensLegend);
			if (codeResult) {
				return {
					resultId: codeResult.resultId,
					data: Uint32Array.from(codeResult.data),
				};
			}
		},
		releaseDocumentSemanticTokens() { },
		async provideDocumentSymbols(model) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDocumentSymbols(model.uri.toString());
			if (codeResult) {
				return codeResult.map(protocol2monaco.asDocumentSymbol);
			}
		},
		async provideDocumentHighlights(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDocumentHighlights(
				model.uri.toString(),
				monaco2protocol.asPosition(position),
			);
			if (codeResult) {
				return codeResult.map(protocol2monaco.asDocumentHighlight);
			}
		},
		async provideLinkedEditingRanges(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findLinkedEditingRanges(
				model.uri.toString(),
				monaco2protocol.asPosition(position),
			);
			if (codeResult) {
				return {
					ranges: codeResult.ranges.map(protocol2monaco.asRange),
					wordPattern: codeResult.wordPattern
						? new RegExp(codeResult.wordPattern)
						: undefined,
				};
			}
		},
		async provideDefinition(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDefinition(
				model.uri.toString(),
				monaco2protocol.asPosition(position),
			);
			if (codeResult) {
				return codeResult.map(protocol2monaco.asLocation);
			}
		},
		async provideImplementation(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findImplementations(
				model.uri.toString(),
				monaco2protocol.asPosition(position),
			);
			if (codeResult) {
				return codeResult.map(protocol2monaco.asLocation);
			}
		},
		async provideTypeDefinition(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findTypeDefinition(
				model.uri.toString(),
				monaco2protocol.asPosition(position),
			);
			if (codeResult) {
				return codeResult.map(protocol2monaco.asLocation);
			}
		},
		async provideCodeLenses(model) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doCodeLens(model.uri.toString());
			if (codeResult) {
				const monacoResult = codeResult.map(protocol2monaco.asCodeLens);
				for (let i = 0; i < monacoResult.length; i++) {
					codeLens.set(monacoResult[i], codeResult[i]);
				}
				return {
					lenses: monacoResult,
					dispose: () => { },
				};
			}
		},
		async resolveCodeLens(_, monacoResult) {
			let codeResult = codeLens.get(monacoResult);
			if (codeResult) {
				const languageService = await worker.withSyncedResources(getSyncUris());
				codeResult = await languageService.doCodeLensResolve(codeResult);
				if (codeResult) {
					monacoResult = protocol2monaco.asCodeLens(codeResult);
					codeLens.set(monacoResult, codeResult);
				}
			}
			return monacoResult;
		},
		async provideCodeActions(model, range, context) {
			const diagnostics: vscode.Diagnostic[] = [];

			for (const marker of context.markers) {
				const diagnostic = markers.get(marker);
				if (diagnostic) {
					diagnostics.push(diagnostic);
				}
			}

			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doCodeActions(
				model.uri.toString(),
				monaco2protocol.asRange(range),
				{
					diagnostics: diagnostics,
					only: context.only ? [context.only] : undefined,
				},
			);

			if (codeResult) {
				const monacoResult = codeResult.map(protocol2monaco.asCodeAction);
				for (let i = 0; i < monacoResult.length; i++) {
					codeActions.set(monacoResult[i], codeResult[i]);
				}
				return {
					actions: monacoResult,
					dispose: () => { },
				};
			}
		},
		async resolveCodeAction(monacoResult) {
			let codeResult = codeActions.get(monacoResult);
			if (codeResult) {
				const languageService = await worker.withSyncedResources(getSyncUris());
				codeResult = await languageService.doCodeActionResolve(codeResult);
				if (codeResult) {
					monacoResult = protocol2monaco.asCodeAction(codeResult);
					codeActions.set(monacoResult, codeResult);
				}
			}
			return monacoResult;
		},
		async provideDocumentFormattingEdits(model, options) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.format(
				model.uri.toString(),
				monaco2protocol.asFormattingOptions(options),
				undefined,
				undefined,
			);
			if (codeResult) {
				return codeResult.map(protocol2monaco.asTextEdit);
			}
		},
		async provideDocumentRangeFormattingEdits(model, range, options) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.format(
				model.uri.toString(),
				monaco2protocol.asFormattingOptions(options),
				monaco2protocol.asRange(range),
				undefined,
			);
			if (codeResult) {
				return codeResult.map(protocol2monaco.asTextEdit);
			}
		},
		async provideOnTypeFormattingEdits(model, position, ch, options) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.format(
				model.uri.toString(),
				monaco2protocol.asFormattingOptions(options),
				undefined,
				{
					ch: ch,
					position: monaco2protocol.asPosition(position),
				},
			);
			if (codeResult) {
				return codeResult.map(protocol2monaco.asTextEdit);
			}
		},
		async provideLinks(model) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDocumentLinks(model.uri.toString());
			if (codeResult) {
				return {
					links: codeResult.map(protocol2monaco.asLink),
				};
			}
		},
		async provideCompletionItems(model, position, context) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doComplete(
				model.uri.toString(),
				monaco2protocol.asPosition(position),
				monaco2protocol.asCompletionContext(context),
			);
			const fallbackRange = {
				start: monaco2protocol.asPosition(position),
				end: monaco2protocol.asPosition(position),
			};
			const monacoResult = protocol2monaco.asCompletionList(codeResult, fallbackRange);
			for (let i = 0; i < codeResult.items.length; i++) {
				completionItems.set(
					monacoResult.suggestions[i],
					codeResult.items[i]
				);
			}
			return monacoResult;
		},
		async resolveCompletionItem(monacoItem) {
			let codeItem = completionItems.get(monacoItem);
			if (codeItem) {
				const languageService = await worker.withSyncedResources(getSyncUris());
				codeItem = await languageService.doCompletionResolve(codeItem);
				const fallbackRange = 'replace' in monacoItem.range
					? monaco2protocol.asRange(monacoItem.range.replace)
					: monaco2protocol.asRange(monacoItem.range);
				monacoItem = protocol2monaco.asCompletionItem(codeItem, fallbackRange);
				completionItems.set(monacoItem, codeItem);
			}
			return monacoItem;
		},
		async provideDocumentColors(model) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDocumentColors(model.uri.toString());
			if (codeResult) {
				return codeResult.map(protocol2monaco.asColorInformation);
			}
		},
		async provideColorPresentations(model, monacoResult) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = colorInfos.get(monacoResult);
			if (codeResult) {
				const codeColors = await languageService.getColorPresentations(
					model.uri.toString(),
					codeResult.color,
					{
						start: monaco2protocol.asPosition(model.getPositionAt(0)),
						end: monaco2protocol.asPosition(
							model.getPositionAt(model.getValueLength())
						),
					},
				);
				if (codeColors) {
					return codeColors.map(protocol2monaco.asColorPresentation);
				}
			}
		},
		async provideFoldingRanges(model, _context) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getFoldingRanges(model.uri.toString());
			if (codeResult) {
				return codeResult.map(protocol2monaco.asFoldingRange);
			}
		},
		async provideDeclaration(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDefinition(
				model.uri.toString(),
				monaco2protocol.asPosition(position),
			);
			if (codeResult) {
				return codeResult.map(protocol2monaco.asLocation);
			}
		},
		async provideSelectionRanges(model, positions) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResults = await Promise.all(
				positions.map((position) =>
					languageService.getSelectionRanges(
						model.uri.toString(),
						[monaco2protocol.asPosition(position)],
					)
				)
			);
			return codeResults.map(
				(codeResult) => codeResult?.map(protocol2monaco.asSelectionRange) ?? []
			);
		},
		async provideSignatureHelp(model, position, _token, context) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getSignatureHelp(
				model.uri.toString(),
				monaco2protocol.asPosition(position),
				monaco2protocol.asSignatureHelpContext(context),
			);
			if (codeResult) {
				return {
					value: protocol2monaco.asSignatureHelp(codeResult),
					dispose: () => { },
				};
			}
		},
		async provideRenameEdits(model, position, newName) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doRename(
				model.uri.toString(),
				monaco2protocol.asPosition(position),
				newName,
			);
			if (codeResult) {
				return protocol2monaco.asWorkspaceEdit(codeResult);
			}
		},
		async provideReferences(model, position, _context) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findReferences(
				model.uri.toString(),
				monaco2protocol.asPosition(position),
			);
			if (codeResult) {
				return codeResult.map(protocol2monaco.asLocation);
			}
		},
		async provideInlayHints(model, range) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getInlayHints(
				model.uri.toString(),
				monaco2protocol.asRange(range),
			);
			if (codeResult) {
				return {
					hints: codeResult.map(protocol2monaco.asInlayHint),
					dispose: () => { },
				};
			}
		},
		async provideHover(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doHover(
				model.uri.toString(),
				monaco2protocol.asPosition(position),
			);
			if (codeResult) {
				return protocol2monaco.asHover(codeResult);
			}
		},
	};
}
