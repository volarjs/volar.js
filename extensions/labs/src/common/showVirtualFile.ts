import type { CodeInformation } from '@volar/language-server';
import { SourceMap, Stack } from '@volar/source-map';
import { BaseLanguageClient, LabsInfo, TextDocument } from '@volar/vscode';
import * as vscode from 'vscode';

const mappingDecorationType = vscode.window.createTextEditorDecorationType({
	borderWidth: '1px',
	borderStyle: 'solid',
	overviewRulerColor: 'blue',
	overviewRulerLane: vscode.OverviewRulerLane.Right,
	light: {
		// this color will be used in light color themes
		borderColor: 'darkblue'
	},
	dark: {
		// this color will be used in dark color themes
		borderColor: 'lightblue'
	}
});
const mappingSelectionDecorationType = vscode.window.createTextEditorDecorationType({
	light: {
		backgroundColor: 'lightblue'
	},
	dark: {
		backgroundColor: 'darkblue'
	}
});
const mappingCursorDecorationType = vscode.window.createTextEditorDecorationType({
	borderWidth: '1px',
	borderStyle: 'solid',
	backgroundColor: 'darkorange'
});

export const sourceUriToVirtualUris = new Map<string, Set<string>>();

export const virtualUriToSourceUri = new Map<string, string>();

export async function activate(info: LabsInfo) {

	const subscriptions: vscode.Disposable[] = [];
	const docChangeEvent = new vscode.EventEmitter<vscode.Uri>();
	const virtualUriToSourceMap = new Map<string, [string, number, SourceMap<CodeInformation>][]>();
	const virtualUriToStacks = new Map<string, Stack[]>();
	const virtualDocuments = new Map<string, TextDocument>();

	for (const extension of info.volarLabs.languageClients) {
		registerProviders(extension);
	}
	info.volarLabs.onDidAddLanguageClient(registerProviders);

	let updateVirtualDocument: NodeJS.Timeout | undefined;
	let updateDecorationsTimeout: NodeJS.Timeout | undefined;

	subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateDecorations));
	subscriptions.push(vscode.window.onDidChangeTextEditorSelection(updateDecorations));
	subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(updateDecorations));
	subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
		if (sourceUriToVirtualUris.has(e.document.uri.toString())) {
			const virtualUris = sourceUriToVirtualUris.get(e.document.uri.toString());
			clearTimeout(updateVirtualDocument);
			updateVirtualDocument = setTimeout(() => {
				virtualUris?.forEach(uri => {
					docChangeEvent.fire(vscode.Uri.parse(uri));
				});
			}, 100);
		}
	}));

	return vscode.Disposable.from(...subscriptions);

	function registerProviders(client: BaseLanguageClient) {

		subscriptions.push(client.onDidChangeState(() => {
			for (const virtualUris of sourceUriToVirtualUris.values()) {
				virtualUris.forEach(uri => {
					docChangeEvent.fire(vscode.Uri.parse(uri));
				});
			}
		}));

		subscriptions.push(vscode.languages.registerHoverProvider({ scheme: client.name.replace(/ /g, '_').toLowerCase() }, {
			async provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken) {

				const maps = virtualUriToSourceMap.get(document.uri.toString());
				if (!maps) {
					return;
				}

				const data: {
					uri: string,
					mapping: any,
				}[] = [];

				for (const [sourceUri, _, map] of maps) {
					const source = map.getSourceOffset(document.offsetAt(position));
					if (source) {
						data.push({
							uri: sourceUri,
							mapping: source,
						});
					}
				}

				if (data.length === 0) {
					return;
				}

				return new vscode.Hover(data.map((data) => [
					data.uri,
					'',
					'',
					'```json',
					JSON.stringify(data.mapping, null, 2),
					'```',
				].join('\n')));
			}
		}));

		subscriptions.push(vscode.languages.registerDefinitionProvider({ scheme: client.name.replace(/ /g, '_').toLowerCase() }, {
			async provideDefinition(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken) {

				const stacks = virtualUriToStacks.get(document.uri.toString());
				if (!stacks) {
					return;
				}

				const offset = document.offsetAt(position);
				const stack = stacks.find(stack => stack.range[0] <= offset && offset <= stack.range[1]);
				if (!stack) {
					return;
				}

				const line = Number(stack.source.split(':').at(-2));
				const character = Number(stack.source.split(':').at(-1));
				const fileName = stack.source.split(':').slice(0, -2).join(':');
				const link: vscode.DefinitionLink = {
					originSelectionRange: new vscode.Range(document.positionAt(stack.range[0]), document.positionAt(stack.range[1])),
					targetUri: vscode.Uri.file(fileName),
					targetRange: new vscode.Range(line - 1, character - 1, line - 1, character - 1),
				};
				return [link];
			}
		}));

		subscriptions.push(vscode.languages.registerInlayHintsProvider({ scheme: client.name.replace(/ /g, '_').toLowerCase() }, {
			provideInlayHints(document, range) {
				const stacks = virtualUriToStacks.get(document.uri.toString());
				const result: vscode.InlayHint[] = [];
				const range2 = [document.offsetAt(range.start), document.offsetAt(range.end)];
				const text = document.getText();
				for (const stack of stacks ?? []) {
					let [start, end] = stack.range;
					let startText = '[';
					let endText = ']';
					while (end > start && text[end - 1] === '\n') {
						end--;
						endText = '\n' + endText;
					}
					while (start < end && text[start] === '\n') {
						start++;
						startText = '\n' + startText;
					}
					if (start >= range2[0] && start <= range2[1]) {
						result.push(new vscode.InlayHint(document.positionAt(start), startText));
						result[result.length - 1].paddingLeft = true;
					}
					if (end >= range2[0] && end <= range2[1]) {
						result.push(new vscode.InlayHint(document.positionAt(end), endText));
						result[result.length - 1].paddingRight = true;
					}
				}
				return result;
			},
		}));

		subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(
			client.name.replace(/ /g, '_').toLowerCase(),
			{
				onDidChange: docChangeEvent.event,
				async provideTextDocumentContent(uri: vscode.Uri): Promise<string | undefined> {

					const requestUri = virtualUriToSourceUri.get(uri.toString());
					if (requestUri) {

						const fileName = uri.with({ scheme: 'file' }).fsPath;
						const virtualFile = await client.sendRequest(info.volarLabs.languageServerProtocol.GetVirtualFileRequest.type, { sourceFileUri: requestUri, virtualFileName: fileName });
						virtualUriToSourceMap.set(uri.toString(), []);

						Object.entries(virtualFile.mappings).forEach(([sourceUri, mappings]) => {
							const sourceEditor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === sourceUri);
							if (sourceEditor) {
								virtualUriToSourceMap.get(uri.toString())?.push([
									sourceEditor.document.uri.toString(),
									sourceEditor.document.version,
									new SourceMap(mappings),
								]);
								if (!sourceUriToVirtualUris.has(sourceUri)) {
									sourceUriToVirtualUris.set(sourceUri, new Set());
								}
								sourceUriToVirtualUris.get(sourceUri)?.add(uri.toString());
							}
						});
						virtualDocuments.set(uri.toString(), TextDocument.create('', '', 0, virtualFile.content));
						virtualUriToStacks.set(uri.toString(), virtualFile.codegenStacks);

						clearTimeout(updateDecorationsTimeout);
						updateDecorationsTimeout = setTimeout(updateDecorations, 100);

						return virtualFile.content;
					}
				}
			},
		));
	}

	function updateDecorations() {
		for (const [_, sources] of virtualUriToSourceMap) {
			for (const [sourceUri] of sources) {
				const sourceEditor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === sourceUri);
				if (sourceEditor) {
					sourceEditor.setDecorations(mappingDecorationType, []);
					sourceEditor.setDecorations(mappingSelectionDecorationType, []);
					sourceEditor.setDecorations(mappingCursorDecorationType, []);
				}
			}
		}
		for (const [virtualUri, sources] of virtualUriToSourceMap) {

			const virtualEditor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === virtualUri);
			let virtualRanges1: vscode.Range[] = [];
			let virtualRanges2: vscode.Range[] = [];
			let virtualRanges3: vscode.Range[] = [];

			if (virtualEditor) {
				for (const [sourceUri, sourceVersion, map] of sources) {
					const sourceEditor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === sourceUri);
					if (sourceEditor && sourceEditor.document.version === sourceVersion) {
						const mappingDecorationRanges = map.mappings
							.map(mapping => mapping.sourceOffsets.map((offset, i) => new vscode.Range(
								sourceEditor.document.positionAt(offset),
								sourceEditor.document.positionAt(offset + mapping.lengths[i]),
							)))
							.flat();
						sourceEditor.setDecorations(mappingDecorationType, mappingDecorationRanges);
						virtualRanges1 = virtualRanges1.concat(
							map.mappings
								.map(mapping => mapping.generatedOffsets.map((offset, i) => new vscode.Range(
									getGeneratedPosition(virtualUri, offset),
									getGeneratedPosition(virtualUri, offset + mapping.lengths[i]),
								)))
								.flat()
						);

						/**
						 * selection
						 */
						if (vscode.window.activeTextEditor) {

							const selection = vscode.window.activeTextEditor.selection;
							const startOffset = vscode.window.activeTextEditor.document.offsetAt(selection.start);
							const endOffset = vscode.window.activeTextEditor.document.offsetAt(selection.end);

							if (vscode.window.activeTextEditor === sourceEditor) {

								const mappedStarts = [...map.getGeneratedOffsets(startOffset)];
								const mappedEnds = [...map.getGeneratedOffsets(endOffset)];

								if (mappedStarts.length || mappedEnds.length) {
									sourceEditor.setDecorations(
										mappingCursorDecorationType,
										[new vscode.Range(
											mappedStarts.length ? selection.start : selection.end,
											mappedEnds.length ? selection.end : selection.start
										)]
									);
								}

								sourceEditor.setDecorations(
									mappingSelectionDecorationType,
									mappedStarts
										.map(([_, mapping]) => mapping.sourceOffsets.map((offset, i) => new vscode.Range(
											sourceEditor.document.positionAt(offset),
											sourceEditor.document.positionAt(offset + mapping.lengths[i]),
										)))
										.flat()
								);

								virtualRanges2 = virtualRanges2.concat(
									mappedStarts
										.map(([_, mapping]) => mapping.generatedOffsets.map((offset, i) => new vscode.Range(
											getGeneratedPosition(virtualUri, offset),
											getGeneratedPosition(virtualUri, offset + mapping.lengths[i]),
										)))
										.flat()
								);
								virtualRanges3 = virtualRanges3.concat(
									mappedStarts.map(mapped => new vscode.Range(
										getGeneratedPosition(virtualUri, mapped[0]),
										getGeneratedPosition(virtualUri, mappedEnds.find(mapped2 => mapped[1] === mapped2[1])?.[0] ?? mapped[0]),
									))
								);

								const mapping = mappedStarts.sort((a, b) => a[1].generatedOffsets[0] - b[1].generatedOffsets[0])[0]?.[1];
								if (mapping) {
									virtualEditor.revealRange(new vscode.Range(
										getGeneratedPosition(virtualUri, mapping.generatedOffsets[0]),
										getGeneratedPosition(virtualUri, mapping.generatedOffsets[0] + mapping.lengths[0]),
									));
								}
							}
							else if (vscode.window.activeTextEditor === virtualEditor) {

								const mappedStarts = [...map.getSourceOffsets(startOffset)];
								const mappedEnds = [...map.getSourceOffsets(endOffset)];

								if (mappedStarts.length || mappedEnds.length) {
									virtualRanges3.push(
										new vscode.Range(
											mappedStarts.length ? selection.start : selection.end,
											mappedEnds.length ? selection.end : selection.start
										)
									);
								}

								sourceEditor.setDecorations(
									mappingSelectionDecorationType,
									mappedStarts
										.map(([_, mapping]) => mapping.sourceOffsets.map((offset, i) => new vscode.Range(
											sourceEditor.document.positionAt(offset),
											sourceEditor.document.positionAt(offset + mapping.lengths[i]),
										)))
										.flat()
								);
								sourceEditor.setDecorations(
									mappingCursorDecorationType,
									mappedStarts.map(mapped => new vscode.Range(
										sourceEditor.document.positionAt(mapped[0]),
										sourceEditor.document.positionAt(mappedEnds.find(mapped2 => mapped[1] === mapped2[1])?.[0] ?? mapped[0]),
									))
								);

								virtualRanges2 = virtualRanges2.concat(
									mappedStarts
										.map(([_, mapping]) => mapping.generatedOffsets.map((offset, i) => new vscode.Range(
											getGeneratedPosition(virtualUri, offset),
											getGeneratedPosition(virtualUri, offset + mapping.lengths[i]),
										)))
										.flat()
								);

								const mapping = mappedStarts.sort((a, b) => a[1].sourceOffsets[0] - b[1].sourceOffsets[0])[0]?.[1];
								if (mapping) {
									sourceEditor.revealRange(new vscode.Range(
										getGeneratedPosition(virtualUri, mapping.sourceOffsets[0]),
										getGeneratedPosition(virtualUri, mapping.sourceOffsets[0] + mapping.lengths[0]),
									));
								}
							}
						}
					}
				}
				virtualEditor.setDecorations(mappingDecorationType, virtualRanges1);
				virtualEditor.setDecorations(mappingSelectionDecorationType, virtualRanges2);
				virtualEditor.setDecorations(mappingCursorDecorationType, virtualRanges3);
			}
		}
	}

	function getGeneratedPosition(virtualUri: string, offset: number) {
		const document = virtualDocuments.get(virtualUri)!;
		const position = document.positionAt(offset);
		return new vscode.Position(position.line, position.character);
	}
}
