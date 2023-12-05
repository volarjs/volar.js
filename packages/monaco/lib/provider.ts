import * as volar from '@volar/language-service';
import * as transform from 'monaco-languageserver-types';
import type { Uri, editor, languages } from 'monaco-types';
import { markers } from './markers.js';

export async function createLanguageFeaturesProvider(
	worker: editor.MonacoWebWorker<volar.LanguageService>,
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

	const completionItems = new WeakMap<languages.CompletionItem, volar.CompletionItem>();
	const codeLens = new WeakMap<languages.CodeLens, volar.CodeLens>();
	const codeActions = new WeakMap<languages.CodeAction, volar.CodeAction>();
	const colorInfos = new WeakMap<languages.IColorInformation, volar.ColorInformation>();
	const documentLinks = new WeakMap<languages.ILink, volar.DocumentLink>();
	const inlayHints = new WeakMap<languages.InlayHint, volar.InlayHint>();
	const languageService = await worker.getProxy();

	return {

		triggerCharacters: await languageService.getTriggerCharacters(),
		autoFormatTriggerCharacters: await languageService.getAutoFormatTriggerCharacters(),
		signatureHelpTriggerCharacters: await languageService.getSignatureHelpTriggerCharacters(),
		signatureHelpRetriggerCharacters: await languageService.getSignatureHelpRetriggerCharacters(),

		getLegend() {
			return volar.standardSemanticTokensLegend;
		},
		async provideDocumentSemanticTokens(model, _lastResultId) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getSemanticTokens(
				model.uri.toString(),
				undefined,
				volar.standardSemanticTokensLegend,
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
			const codeResult = await languageService.getSemanticTokens(model.uri.toString(), transform.fromRange(range), volar.standardSemanticTokensLegend);
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
				return codeResult.map(transform.toDocumentSymbol);
			}
		},
		async provideDocumentHighlights(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDocumentHighlights(
				model.uri.toString(),
				transform.fromPosition(position),
			);
			if (codeResult) {
				return codeResult.map(transform.toDocumentHighlight);
			}
		},
		async provideLinkedEditingRanges(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findLinkedEditingRanges(
				model.uri.toString(),
				transform.fromPosition(position),
			);
			if (codeResult) {
				return {
					ranges: codeResult.ranges.map(transform.toRange),
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
				transform.fromPosition(position),
			);
			if (codeResult) {
				return codeResult.map(transform.toLocationLink);
			}
		},
		async provideImplementation(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findImplementations(
				model.uri.toString(),
				transform.fromPosition(position),
			);
			if (codeResult) {
				return codeResult.map(transform.toLocationLink);
			}
		},
		async provideTypeDefinition(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findTypeDefinition(
				model.uri.toString(),
				transform.fromPosition(position),
			);
			if (codeResult) {
				return codeResult.map(transform.toLocationLink);
			}
		},
		async provideCodeLenses(model) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doCodeLens(model.uri.toString());
			if (codeResult) {
				const monacoResult = codeResult.map(transform.toCodeLens);
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
					monacoResult = transform.toCodeLens(codeResult);
					codeLens.set(monacoResult, codeResult);
				}
			}
			return monacoResult;
		},
		async provideCodeActions(model, range, context) {
			const diagnostics: volar.Diagnostic[] = [];

			for (const marker of context.markers) {
				const diagnostic = markers.get(marker);
				if (diagnostic) {
					diagnostics.push(diagnostic);
				}
			}

			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doCodeActions(
				model.uri.toString(),
				transform.fromRange(range),
				{
					diagnostics: diagnostics,
					only: context.only ? [context.only] : undefined,
				},
			);

			if (codeResult) {
				const monacoResult = codeResult.map(codeAction => transform.toCodeAction(codeAction));
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
					monacoResult = transform.toCodeAction(codeResult);
					codeActions.set(monacoResult, codeResult);
				}
			}
			return monacoResult;
		},
		async provideDocumentFormattingEdits(model, options) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.format(
				model.uri.toString(),
				transform.fromFormattingOptions(options),
				undefined,
				undefined,
			);
			if (codeResult) {
				return codeResult.map(transform.toTextEdit);
			}
		},
		async provideDocumentRangeFormattingEdits(model, range, options) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.format(
				model.uri.toString(),
				transform.fromFormattingOptions(options),
				transform.fromRange(range),
				undefined,
			);
			if (codeResult) {
				return codeResult.map(transform.toTextEdit);
			}
		},
		async provideOnTypeFormattingEdits(model, position, ch, options) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.format(
				model.uri.toString(),
				transform.fromFormattingOptions(options),
				undefined,
				{
					ch: ch,
					position: transform.fromPosition(position),
				},
			);
			if (codeResult) {
				return codeResult.map(transform.toTextEdit);
			}
		},
		async provideLinks(model) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDocumentLinks(model.uri.toString());
			if (codeResult) {
				return {
					links: codeResult.map(link => {
						const monacoLink = transform.toLink(link);
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
				return transform.toLink(codeResult);
			}
			return link;
		},
		async provideCompletionItems(model, position, context) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doComplete(
				model.uri.toString(),
				transform.fromPosition(position),
				transform.fromCompletionContext(context),
			);
			const monacoResult = transform.toCompletionList(codeResult, {
				range: {
					startColumn: position.column,
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
				monacoItem = transform.toCompletionItem(codeItem, {
					range: 'replace' in monacoItem.range ? monacoItem.range.replace : monacoItem.range
				});
				completionItems.set(monacoItem, codeItem);
			}
			return monacoItem;
		},
		async provideDocumentColors(model) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDocumentColors(model.uri.toString());
			if (codeResult) {
				return codeResult.map(transform.toColorInformation);
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
						start: transform.fromPosition(model.getPositionAt(0)),
						end: transform.fromPosition(
							model.getPositionAt(model.getValueLength())
						),
					},
				);
				if (codeColors) {
					return codeColors.map(transform.toColorPresentation);
				}
			}
		},
		async provideFoldingRanges(model, _context) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getFoldingRanges(model.uri.toString());
			if (codeResult) {
				return codeResult.map(transform.toFoldingRange);
			}
		},
		async provideDeclaration(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findDefinition(
				model.uri.toString(),
				transform.fromPosition(position),
			);
			if (codeResult) {
				return codeResult.map(transform.toLocationLink);
			}
		},
		async provideSelectionRanges(model, positions) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResults = await Promise.all(
				positions.map((position) =>
					languageService.getSelectionRanges(
						model.uri.toString(),
						[transform.fromPosition(position)],
					)
				)
			);
			return codeResults.map(
				(codeResult) => codeResult?.map(transform.toSelectionRange) ?? []
			);
		},
		async provideSignatureHelp(model, position, _token, context) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getSignatureHelp(
				model.uri.toString(),
				transform.fromPosition(position),
				transform.fromSignatureHelpContext(context),
			);
			if (codeResult) {
				return {
					value: transform.toSignatureHelp(codeResult),
					dispose: () => { },
				};
			}
		},
		async provideRenameEdits(model, position, newName) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doRename(
				model.uri.toString(),
				transform.fromPosition(position),
				newName,
			);
			if (codeResult) {
				return transform.toWorkspaceEdit(codeResult);
			}
		},
		async provideReferences(model, position, _context) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.findReferences(
				model.uri.toString(),
				transform.fromPosition(position),
			);
			if (codeResult) {
				return codeResult.map(transform.toLocation);
			}
		},
		async provideInlayHints(model, range) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getInlayHints(
				model.uri.toString(),
				transform.fromRange(range),
			);
			if (codeResult) {
				return {
					hints: codeResult.map(hint => {
						const monacoHint = transform.toInlayHint(hint);
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
				return transform.toInlayHint(resolvedCodeHint);
			}
			return hint;
		},
		async provideHover(model, position) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.doHover(
				model.uri.toString(),
				transform.fromPosition(position),
			);
			if (codeResult) {
				return transform.toHover(codeResult);
			}
		},
	};
}
