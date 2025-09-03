import type {
	CodeAction,
	CodeLens,
	ColorInformation,
	CompletionItem,
	Diagnostic,
	DocumentLink,
	InlayHint,
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
	toSelectionRanges,
	toSemanticTokens,
	toSignatureHelp,
	toTextEdit,
	toWorkspaceEdit,
} from 'monaco-languageserver-types';
import type { editor, languages, Uri } from 'monaco-types';
import { type WorkerLanguageService } from '../worker.js';
import { markers } from './markers.js';
import { getRequestId } from './requestId.js';

export async function createLanguageFeaturesProvider(
	worker: editor.MonacoWebWorker<WorkerLanguageService>,
	getSyncUris: () => Uri[],
): Promise<
	& languages.HoverProvider
	& languages.DocumentSymbolProvider
	& languages.DocumentHighlightProvider
	& languages.LinkedEditingRangeProvider
	& languages.DefinitionProvider
	& languages.TypeDefinitionProvider
	& languages.ImplementationProvider
	& languages.CodeLensProvider
	& languages.CodeActionProvider
	& languages.DocumentFormattingEditProvider
	& languages.DocumentRangeFormattingEditProvider
	& languages.OnTypeFormattingEditProvider
	& languages.LinkProvider
	& languages.CompletionItemProvider
	& languages.DocumentColorProvider
	& languages.FoldingRangeProvider
	& languages.DeclarationProvider
	& languages.SignatureHelpProvider
	& languages.RenameProvider
	& languages.ReferenceProvider
	& languages.SelectionRangeProvider
	& languages.InlayHintsProvider
	& languages.DocumentSemanticTokensProvider
	& languages.DocumentRangeSemanticTokensProvider
> {
	const completionItems = new WeakMap<languages.CompletionItem, CompletionItem>();
	const codeLens = new WeakMap<languages.CodeLens, CodeLens>();
	const codeActions = new WeakMap<languages.CodeAction, CodeAction>();
	const colorInfos = new WeakMap<languages.IColorInformation, ColorInformation>();
	const documentLinks = new WeakMap<languages.ILink, DocumentLink>();
	const inlayHints = new WeakMap<languages.InlayHint, InlayHint>();
	const languageService = await worker.getProxy();
	const legend = await (languageService.getSemanticTokenLegend() as unknown as Promise<
		ReturnType<typeof languageService.getSemanticTokenLegend>
	>);

	return {
		triggerCharacters: await (languageService.getTriggerCharacters() as unknown as Promise<
			ReturnType<typeof languageService.getTriggerCharacters>
		>),
		autoFormatTriggerCharacters: await (languageService.getAutoFormatTriggerCharacters() as unknown as Promise<
			ReturnType<typeof languageService.getAutoFormatTriggerCharacters>
		>),
		signatureHelpTriggerCharacters: await (languageService.getSignatureHelpTriggerCharacters() as unknown as Promise<
			ReturnType<typeof languageService.getSignatureHelpTriggerCharacters>
		>),
		signatureHelpRetriggerCharacters:
			await (languageService.getSignatureHelpRetriggerCharacters() as unknown as Promise<
				ReturnType<typeof languageService.getSignatureHelpRetriggerCharacters>
			>),
		getLegend() {
			return legend;
		},
		async provideDocumentSemanticTokens(model, _lastResultId, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getSemanticTokens(
				getRequestId(token, languageService),
				model.uri,
				undefined,
				legend,
			);
			if (codeResult) {
				return toSemanticTokens(codeResult);
			}
		},
		async provideDocumentRangeSemanticTokens(model, range, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getSemanticTokens(
				getRequestId(token, languageService),
				model.uri,
				fromRange(range),
				legend,
			);
			if (codeResult) {
				return toSemanticTokens(codeResult);
			}
		},
		releaseDocumentSemanticTokens() {},
		async provideDocumentSymbols(model, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getDocumentSymbols(
				getRequestId(token, languageService),
				model.uri,
			);
			if (codeResult) {
				return codeResult.map(toDocumentSymbol);
			}
		},
		async provideDocumentHighlights(model, position, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getDocumentHighlights(
				getRequestId(token, languageService),
				model.uri,
				fromPosition(position),
			);
			if (codeResult) {
				return codeResult.map(toDocumentHighlight);
			}
		},
		async provideLinkedEditingRanges(model, position, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getLinkedEditingRanges(
				getRequestId(token, languageService),
				model.uri,
				fromPosition(position),
			);
			if (codeResult) {
				return toLinkedEditingRanges(codeResult);
			}
		},
		async provideDefinition(model, position, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getDefinition(
				getRequestId(token, languageService),
				model.uri,
				fromPosition(position),
			);
			if (codeResult) {
				return codeResult.map(toLocationLink);
			}
		},
		async provideImplementation(model, position, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getImplementations(
				getRequestId(token, languageService),
				model.uri,
				fromPosition(position),
			);
			if (codeResult) {
				return codeResult.map(toLocationLink);
			}
		},
		async provideTypeDefinition(model, position, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getTypeDefinition(
				getRequestId(token, languageService),
				model.uri,
				fromPosition(position),
			);
			if (codeResult) {
				return codeResult.map(toLocationLink);
			}
		},
		async provideCodeLenses(model, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getCodeLenses(
				getRequestId(token, languageService),
				model.uri,
			);
			if (codeResult) {
				const monacoResult = codeResult.map(toCodeLens);
				for (let i = 0; i < monacoResult.length; i++) {
					codeLens.set(monacoResult[i], codeResult[i]);
				}
				return {
					lenses: monacoResult,
					dispose: () => {},
				};
			}
		},
		async resolveCodeLens(_, monacoResult, token) {
			let codeResult = codeLens.get(monacoResult);
			if (codeResult) {
				const languageService = await worker.withSyncedResources(getSyncUris());
				codeResult = await languageService.resolveCodeLens(
					getRequestId(token, languageService),
					codeResult,
				);
				if (codeResult) {
					monacoResult = toCodeLens(codeResult);
					codeLens.set(monacoResult, codeResult);
				}
			}
			return monacoResult;
		},
		async provideCodeActions(model, range, context, token) {
			const diagnostics: Diagnostic[] = [];

			for (const marker of context.markers) {
				const diagnostic = markers.get(marker);
				if (diagnostic) {
					diagnostics.push(diagnostic);
				}
			}

			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getCodeActions(
				getRequestId(token, languageService),
				model.uri,
				fromRange(range),
				{
					diagnostics: diagnostics,
					only: context.only ? [context.only] : undefined,
				},
			);

			if (codeResult) {
				const monacoResult = codeResult.map(toCodeAction);
				for (let i = 0; i < monacoResult.length; i++) {
					codeActions.set(monacoResult[i], codeResult[i]);
				}
				return {
					actions: monacoResult,
					dispose: () => {},
				};
			}
		},
		async resolveCodeAction(monacoResult, token) {
			let codeResult = codeActions.get(monacoResult);
			if (codeResult) {
				const languageService = await worker.withSyncedResources(getSyncUris());
				codeResult = await languageService.resolveCodeAction(
					getRequestId(token, languageService),
					codeResult,
				);
				if (codeResult) {
					monacoResult = toCodeAction(codeResult);
					codeActions.set(monacoResult, codeResult);
				}
			}
			return monacoResult;
		},
		async provideDocumentFormattingEdits(model, options, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getDocumentFormattingEdits(
				getRequestId(token, languageService),
				model.uri,
				fromFormattingOptions(options),
				undefined,
				undefined,
			);
			if (codeResult) {
				return codeResult.map(toTextEdit);
			}
		},
		async provideDocumentRangeFormattingEdits(model, range, options, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getDocumentFormattingEdits(
				getRequestId(token, languageService),
				model.uri,
				fromFormattingOptions(options),
				fromRange(range),
				undefined,
			);
			if (codeResult) {
				return codeResult.map(toTextEdit);
			}
		},
		async provideOnTypeFormattingEdits(model, position, ch, options, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getDocumentFormattingEdits(
				getRequestId(token, languageService),
				model.uri,
				fromFormattingOptions(options),
				undefined,
				{
					ch: ch,
					position: fromPosition(position),
				},
			);
			if (codeResult) {
				return codeResult.map(toTextEdit);
			}
		},
		async provideLinks(model, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getDocumentLinks(
				getRequestId(token, languageService),
				model.uri,
			);
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
		async resolveLink(link, token) {
			let codeResult = documentLinks.get(link);
			if (codeResult) {
				codeResult = await languageService.resolveDocumentLink(
					getRequestId(token, languageService),
					codeResult,
				);
				return toLink(codeResult);
			}
			return link;
		},
		async provideCompletionItems(model, position, context, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getCompletionItems(
				getRequestId(token, languageService),
				model.uri,
				fromPosition(position),
				fromCompletionContext(context),
			);
			const wordInfo = model.getWordUntilPosition(position);
			const monacoResult = toCompletionList(codeResult, {
				range: {
					startColumn: wordInfo.startColumn,
					startLineNumber: position.lineNumber,
					endColumn: position.column,
					endLineNumber: position.lineNumber,
				},
			});
			for (let i = 0; i < codeResult.items.length; i++) {
				completionItems.set(
					monacoResult.suggestions[i],
					codeResult.items[i],
				);
			}
			return monacoResult;
		},
		async resolveCompletionItem(monacoItem, token) {
			let codeItem = completionItems.get(monacoItem);
			if (codeItem) {
				const languageService = await worker.withSyncedResources(getSyncUris());
				codeItem = await languageService.resolveCompletionItem(
					getRequestId(token, languageService),
					codeItem,
				);
				monacoItem = toCompletionItem(codeItem, {
					range: 'replace' in monacoItem.range ? monacoItem.range.replace : monacoItem.range,
				});
				completionItems.set(monacoItem, codeItem);
			}
			return monacoItem;
		},
		async provideDocumentColors(model, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getDocumentColors(
				getRequestId(token, languageService),
				model.uri,
			);
			if (codeResult) {
				return codeResult.map(toColorInformation);
			}
		},
		async provideColorPresentations(model, monacoResult, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = colorInfos.get(monacoResult);
			if (codeResult) {
				const codeColors = await languageService.getColorPresentations(
					getRequestId(token, languageService),
					model.uri,
					codeResult.color,
					{
						start: fromPosition(model.getPositionAt(0)),
						end: fromPosition(
							model.getPositionAt(model.getValueLength()),
						),
					},
				);
				if (codeColors) {
					return codeColors.map(toColorPresentation);
				}
			}
		},
		async provideFoldingRanges(model, _context, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getFoldingRanges(
				getRequestId(token, languageService),
				model.uri,
			);
			if (codeResult) {
				return codeResult.map(toFoldingRange);
			}
		},
		async provideDeclaration(model, position, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getDefinition(
				getRequestId(token, languageService),
				model.uri,
				fromPosition(position),
			);
			if (codeResult) {
				return codeResult.map(toLocationLink);
			}
		},
		async provideSelectionRanges(model, positions, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResults = await languageService.getSelectionRanges(
				getRequestId(token, languageService),
				model.uri,
				positions.map(fromPosition),
			);
			return codeResults?.map(toSelectionRanges);
		},
		async provideSignatureHelp(model, position, token, context) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getSignatureHelp(
				getRequestId(token, languageService),
				model.uri,
				fromPosition(position),
				fromSignatureHelpContext(context),
			);
			if (codeResult) {
				return {
					value: toSignatureHelp(codeResult),
					dispose: () => {},
				};
			}
		},
		async provideRenameEdits(model, position, newName, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getRenameEdits(
				getRequestId(token, languageService),
				model.uri,
				fromPosition(position),
				newName,
			);
			if (codeResult) {
				return toWorkspaceEdit(codeResult);
			}
		},
		async provideReferences(model, position, context, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getReferences(
				getRequestId(token, languageService),
				model.uri,
				fromPosition(position),
				context,
			);
			if (codeResult) {
				return codeResult.map(toLocation);
			}
		},
		async provideInlayHints(model, range, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getInlayHints(
				getRequestId(token, languageService),
				model.uri,
				fromRange(range),
			);
			if (codeResult) {
				return {
					hints: codeResult.map(hint => {
						const monacoHint = toInlayHint(hint);
						inlayHints.set(monacoHint, hint);
						return monacoHint;
					}),
					dispose: () => {},
				};
			}
		},
		async resolveInlayHint(hint, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeHint = inlayHints.get(hint);
			if (codeHint) {
				const resolvedCodeHint = await languageService.resolveInlayHint(
					getRequestId(token, languageService),
					codeHint,
				);
				return toInlayHint(resolvedCodeHint);
			}
			return hint;
		},
		async provideHover(model, position, token) {
			const languageService = await worker.withSyncedResources(getSyncUris());
			const codeResult = await languageService.getHover(
				getRequestId(token, languageService),
				model.uri,
				fromPosition(position),
			);
			if (codeResult) {
				return toHover(codeResult);
			}
		},
	};
}
