import type {
	CodeAction,
	CodeLens,
	ColorInformation,
	CompletionItem,
	Diagnostic,
	DocumentLink,
	InlayHint,
	LanguageService,
} from '@volar/language-service';
import {
	fromCompletionContext,
	fromFormattingOptions,
	fromPosition,
	fromRange,
	fromSignatureHelpContext,
	toCodeAction,
	toCodeLens,
	toColorInformation,
	toColorPresentation,
	toCompletionItem,
	toCompletionList,
	toDocumentHighlight,
	toDocumentSymbol,
	toFoldingRange,
	toHover,
	toInlayHint,
	toLink,
	toLinkedEditingRanges,
	toLocation,
	toLocationLink,
	toSelectionRange,
	toSemanticTokens,
	toSignatureHelp,
	toTextEdit,
	toWorkspaceEdit,
} from 'monaco-languageserver-types';
import type { Uri, editor, languages } from 'monaco-types';
import type { URI } from 'vscode-uri';
import { markers } from './markers.js';

export async function createLanguageFeaturesProvider(
	worker: editor.MonacoWebWorker<LanguageService>,
	getSyncUris: () => Uri[]
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

	const completionItems = new WeakMap<languages.CompletionItem, CompletionItem>();
	const codeLens = new WeakMap<languages.CodeLens, CodeLens>();
	const codeActions = new WeakMap<languages.CodeAction, CodeAction>();
	const colorInfos = new WeakMap<languages.IColorInformation, ColorInformation>();
	const documentLinks = new WeakMap<languages.ILink, DocumentLink>();
	const inlayHints = new WeakMap<languages.InlayHint, InlayHint>();
	const languageService = await worker.getProxy();
	const legend = await languageService.getSemanticTokenLegend();

	return {

		triggerCharacters: await languageService.getTriggerCharacters(),
		autoFormatTriggerCharacters: await languageService.getAutoFormatTriggerCharacters(),
		signatureHelpTriggerCharacters: await languageService.getSignatureHelpTriggerCharacters(),
		signatureHelpRetriggerCharacters: await languageService.getSignatureHelpRetriggerCharacters(),

		getLegend() {
			return legend;
		},
		async provideDocumentSemanticTokens(model, _lastResultId) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getSemanticTokens(
				model.uri as URI,
				undefined,
				legend
			);
			if (codeResult) {
				return toSemanticTokens(codeResult);
			}
		},
		async provideDocumentRangeSemanticTokens(model, range) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getSemanticTokens(model.uri as URI, fromRange(range), legend);
			if (codeResult) {
				return toSemanticTokens(codeResult);
			}
		},
		releaseDocumentSemanticTokens() { },
		async provideDocumentSymbols(model) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDocumentSymbols(model.uri as URI);
			if (codeResult) {
				return codeResult.map(toDocumentSymbol);
			}
		},
		async provideDocumentHighlights(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDocumentHighlights(
				model.uri as URI,
				fromPosition(position)
			);
			if (codeResult) {
				return codeResult.map(toDocumentHighlight);
			}
		},
		async provideLinkedEditingRanges(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findLinkedEditingRanges(
				model.uri as URI,
				fromPosition(position)
			);
			if (codeResult) {
				return toLinkedEditingRanges(codeResult);
			}
		},
		async provideDefinition(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDefinition(
				model.uri as URI,
				fromPosition(position)
			);
			if (codeResult) {
				return codeResult.map(toLocationLink);
			}
		},
		async provideImplementation(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findImplementations(
				model.uri as URI,
				fromPosition(position)
			);
			if (codeResult) {
				return codeResult.map(toLocationLink);
			}
		},
		async provideTypeDefinition(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findTypeDefinition(
				model.uri as URI,
				fromPosition(position)
			);
			if (codeResult) {
				return codeResult.map(toLocationLink);
			}
		},
		async provideCodeLenses(model) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doCodeLens(model.uri as URI);
			if (codeResult) {
				const monacoResult = codeResult.map(toCodeLens);
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
					monacoResult = toCodeLens(codeResult);
					codeLens.set(monacoResult, codeResult);
				}
			}
			return monacoResult;
		},
		async provideCodeActions(model, range, context) {
			const diagnostics: Diagnostic[] = [];

			for (const marker of context.markers) {
				const diagnostic = markers.get(marker);
				if (diagnostic) {
					diagnostics.push(diagnostic);
				}
			}

			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doCodeActions(
				model.uri as URI,
				fromRange(range),
				{
					diagnostics: diagnostics,
					only: context.only ? [context.only] : undefined,
				}
			);

			if (codeResult) {
				const monacoResult = codeResult.map(codeAction => toCodeAction(codeAction));
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
					monacoResult = toCodeAction(codeResult);
					codeActions.set(monacoResult, codeResult);
				}
			}
			return monacoResult;
		},
		async provideDocumentFormattingEdits(model, options) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.format(
				model.uri as URI,
				fromFormattingOptions(options),
				undefined,
				undefined
			);
			if (codeResult) {
				return codeResult.map(toTextEdit);
			}
		},
		async provideDocumentRangeFormattingEdits(model, range, options) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.format(
				model.uri as URI,
				fromFormattingOptions(options),
				fromRange(range),
				undefined
			);
			if (codeResult) {
				return codeResult.map(toTextEdit);
			}
		},
		async provideOnTypeFormattingEdits(model, position, ch, options) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.format(
				model.uri as URI,
				fromFormattingOptions(options),
				undefined,
				{
					ch: ch,
					position: fromPosition(position),
				}
			);
			if (codeResult) {
				return codeResult.map(toTextEdit);
			}
		},
		async provideLinks(model) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDocumentLinks(model.uri as URI);
			if (codeResult) {
				return {
					links: codeResult.map(link => {
						const monacoLink = toLink(link);
						documentLinks.set(monacoLink, link);
						return monacoLink;
					}),
				};
			}
		},
		async resolveLink(link) {
			let codeResult = documentLinks.get(link);
			if (codeResult) {
				codeResult = await languageService.doDocumentLinkResolve(codeResult);
				return toLink(codeResult);
			}
			return link;
		},
		async provideCompletionItems(model, position, context) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doComplete(
				model.uri as URI,
				fromPosition(position),
				fromCompletionContext(context)
			);
			const wordInfo = model.getWordUntilPosition(position);
			const monacoResult = toCompletionList(codeResult, {
				range: {
					startColumn: wordInfo.startColumn,
					startLineNumber: position.lineNumber,
					endColumn: position.column,
					endLineNumber: position.lineNumber,
				}
			});
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
				monacoItem = toCompletionItem(codeItem, {
					range: 'replace' in monacoItem.range ? monacoItem.range.replace : monacoItem.range
				});
				completionItems.set(monacoItem, codeItem);
			}
			return monacoItem;
		},
		async provideDocumentColors(model) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDocumentColors(model.uri as URI);
			if (codeResult) {
				return codeResult.map(toColorInformation);
			}
		},
		async provideColorPresentations(model, monacoResult) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = colorInfos.get(monacoResult);
			if (codeResult) {
				const codeColors = await languageService.getColorPresentations(
					model.uri as URI,
					codeResult.color,
					{
						start: fromPosition(model.getPositionAt(0)),
						end: fromPosition(
							model.getPositionAt(model.getValueLength())
						),
					}
				);
				if (codeColors) {
					return codeColors.map(toColorPresentation);
				}
			}
		},
		async provideFoldingRanges(model, _context) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getFoldingRanges(model.uri as URI);
			if (codeResult) {
				return codeResult.map(toFoldingRange);
			}
		},
		async provideDeclaration(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDefinition(
				model.uri as URI,
				fromPosition(position)
			);
			if (codeResult) {
				return codeResult.map(toLocationLink);
			}
		},
		async provideSelectionRanges(model, positions) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResults = await Promise.all(
				positions.map(position =>
					languageService.getSelectionRanges(
						model.uri as URI,
						[fromPosition(position)]
					)
				)
			);
			return codeResults.map(
				codeResult => codeResult?.map(toSelectionRange) ?? []
			);
		},
		async provideSignatureHelp(model, position, _token, context) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getSignatureHelp(
				model.uri as URI,
				fromPosition(position),
				fromSignatureHelpContext(context)
			);
			if (codeResult) {
				return {
					value: toSignatureHelp(codeResult),
					dispose: () => { },
				};
			}
		},
		async provideRenameEdits(model, position, newName) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doRename(
				model.uri as URI,
				fromPosition(position),
				newName
			);
			if (codeResult) {
				return toWorkspaceEdit(codeResult);
			}
		},
		async provideReferences(model, position, _context) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findReferences(
				model.uri as URI,
				fromPosition(position),
				{ includeDeclaration: true }
			);
			if (codeResult) {
				return codeResult.map(toLocation);
			}
		},
		async provideInlayHints(model, range) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getInlayHints(
				model.uri as URI,
				fromRange(range)
			);
			if (codeResult) {
				return {
					hints: codeResult.map(hint => {
						const monacoHint = toInlayHint(hint);
						inlayHints.set(monacoHint, hint);
						return monacoHint;
					}),
					dispose: () => { },
				};
			}
		},
		async resolveInlayHint(hint) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeHint = inlayHints.get(hint);
			if (codeHint) {
				const resolvedCodeHint = await languageService.doInlayHintResolve(codeHint);
				return toInlayHint(resolvedCodeHint);
			}
			return hint;
		},
		async provideHover(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doHover(
				model.uri as URI,
				fromPosition(position)
			);
			if (codeResult) {
				return toHover(codeResult);
			}
		},
	};
}
