import type { CodeInformation, HoverParams, SelectionRangeParams } from '@volar/language-server';
import { SourceMap } from '@volar/source-map';
import { type DocumentDiagnosticParams, type LabsInfo, TextDocument } from '@volar/vscode';
import * as vscode from 'vscode';
import { VOLAR_VIRTUAL_CODE_SCHEME } from '../views/virtualCodesView';

const mappingDecorationType = vscode.window.createTextEditorDecorationType({
	borderWidth: '0.5px',
	borderStyle: 'solid',
});
const mappingSelectionDecorationType = vscode.window.createTextEditorDecorationType({
	borderWidth: '1px',
	borderStyle: 'solid',
	borderColor: 'darkorange',
});
const mappingCursorDecorationType = vscode.window.createTextEditorDecorationType({
	borderWidth: '1px',
	borderStyle: 'solid',
	borderColor: 'darkorange',
	backgroundColor: 'darkorange',
});

export const sourceDocUriToVirtualDocUris = new Map<string, Set<string>>();

export const virtualDocUriToSourceDocUri = new Map<string, { fileUri: string; virtualCodeId: string }>();

export function activate(extensions: vscode.Extension<LabsInfo>[]) {
	const subscriptions: vscode.Disposable[] = [];
	const docChangeEvent = new vscode.EventEmitter<vscode.Uri>();
	const virtualUriToSourceMap = new Map<string, [string, SourceMap<CodeInformation>][]>();
	const virtualDocuments = new Map<string, TextDocument>();
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('volar-labs');

	let updateVirtualDocument: ReturnType<typeof setTimeout> | undefined;
	let updateDecorationsTimeout: ReturnType<typeof setTimeout> | undefined;

	subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(updateDecorations),
		vscode.window.onDidChangeTextEditorSelection(updateDecorations),
		vscode.window.onDidChangeVisibleTextEditors(updateDecorations),
		vscode.workspace.onDidChangeTextDocument(e => {
			if (sourceDocUriToVirtualDocUris.has(e.document.uri.toString())) {
				const virtualUris = sourceDocUriToVirtualDocUris.get(e.document.uri.toString());
				clearTimeout(updateVirtualDocument);
				updateVirtualDocument = setTimeout(() => {
					virtualUris?.forEach(uri => {
						docChangeEvent.fire(vscode.Uri.parse(uri));
					});
				}, 100);
			}
		}),
		vscode.languages.registerHoverProvider({ scheme: VOLAR_VIRTUAL_CODE_SCHEME }, {
			async provideHover(document, position) {
				const clientId = document.uri.authority;
				const info = extensions.find(extension =>
					extension.exports.volarLabs.languageClients.some(client =>
						// @ts-expect-error
						client._id.toLowerCase() === clientId.toLowerCase()
					)
				)?.exports;
				if (info) {
					for (const client of info.volarLabs.languageClients) {
						const result = await client.sendRequest(
							info.volarLabs.languageServerProtocol.HoverRequest.type,
							{
								textDocument: {
									uri: client.code2ProtocolConverter.asUri(getEmbeddedDocumentUri(document.uri)),
								},
								position: client.code2ProtocolConverter.asPosition(position),
							} satisfies HoverParams,
						);
						if (result) {
							return client.protocol2CodeConverter.asHover(result);
						}
					}
				}
			},
		}),
		vscode.languages.registerSelectionRangeProvider({ scheme: VOLAR_VIRTUAL_CODE_SCHEME }, {
			async provideSelectionRanges(document, positions) {
				const clientId = document.uri.authority;
				const info = extensions.find(extension =>
					extension.exports.volarLabs.languageClients.some(client =>
						// @ts-expect-error
						client._id.toLowerCase() === clientId.toLowerCase()
					)
				)?.exports;
				if (info) {
					for (const client of info.volarLabs.languageClients) {
						const result = await client.sendRequest(
							info.volarLabs.languageServerProtocol.SelectionRangeRequest.type,
							{
								textDocument: {
									uri: client.code2ProtocolConverter.asUri(getEmbeddedDocumentUri(document.uri)),
								},
								positions: await client.code2ProtocolConverter.asPositions(positions),
							} satisfies SelectionRangeParams,
						);
						if (result) {
							return client.protocol2CodeConverter.asSelectionRanges(result);
						}
					}
				}
			},
		}),
		vscode.languages.registerHoverProvider({ scheme: VOLAR_VIRTUAL_CODE_SCHEME }, {
			provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken) {
				const maps = virtualUriToSourceMap.get(document.uri.toString());
				if (!maps) {
					return;
				}

				const data: {
					uri: string;
					mapping: any;
				}[] = [];

				for (const [sourceUri, map] of maps) {
					for (const source of map.toSourceLocation(document.offsetAt(position))) {
						data.push({
							uri: sourceUri,
							mapping: source,
						});
						break;
					}
				}

				if (data.length === 0) {
					return;
				}

				return new vscode.Hover(data.map(data =>
					[
						data.uri,
						'',
						'',
						'```json',
						JSON.stringify(data.mapping, null, 2),
						'```',
					].join('\n')
				));
			},
		}),
		vscode.workspace.registerTextDocumentContentProvider(
			VOLAR_VIRTUAL_CODE_SCHEME,
			{
				onDidChange: docChangeEvent.event,
				async provideTextDocumentContent(uri: vscode.Uri): Promise<string | undefined> {
					virtualUriToSourceMap.set(uri.toString(), []);

					const source = virtualDocUriToSourceDocUri.get(uri.toString());
					if (!source) {
						return;
					}

					const clientId = uri.authority;
					const info = extensions.find(extension =>
						extension.exports.volarLabs.languageClients.some(client =>
							// @ts-expect-error
							client._id.toLowerCase() === clientId.toLowerCase()
						)
					)?.exports;
					if (!info) {
						return;
					}

					const client = info.volarLabs.languageClients.find(
						// @ts-expect-error
						client => client._id.toLowerCase() === clientId.toLowerCase(),
					)!;
					const virtualCode = await client.sendRequest(
						info.volarLabs.languageServerProtocol.GetVirtualCodeRequest.type,
						source,
					);

					Object.entries(virtualCode.mappings).forEach(([sourceUri, mappings]) => {
						virtualUriToSourceMap.get(uri.toString())?.push([
							sourceUri,
							new SourceMap(mappings),
						]);
						if (!sourceDocUriToVirtualDocUris.has(sourceUri)) {
							sourceDocUriToVirtualDocUris.set(sourceUri, new Set());
						}
						sourceDocUriToVirtualDocUris.get(sourceUri)?.add(uri.toString());
					});
					virtualDocuments.set(uri.toString(), TextDocument.create('', '', 0, virtualCode.content));

					clearTimeout(updateDecorationsTimeout);
					updateDecorationsTimeout = setTimeout(() => {
						updateDecorations();
						updateDiagnostic(uri, info);
					}, 100);

					return virtualCode.content;
				},
			},
		),
	);

	return vscode.Disposable.from(...subscriptions);

	async function updateDiagnostic(uri: vscode.Uri, info: LabsInfo) {
		const embeddedUri = getEmbeddedDocumentUri(uri);
		for (const client of info.volarLabs.languageClients) {
			const diagnostics = await client.sendRequest(
				info.volarLabs.languageServerProtocol.DocumentDiagnosticRequest.type,
				{
					textDocument: {
						uri: client.code2ProtocolConverter.asUri(embeddedUri),
					},
				} satisfies DocumentDiagnosticParams,
			);
			if (diagnostics.kind === 'full') {
				diagnosticCollection.set(uri, await client.protocol2CodeConverter.asDiagnostics(diagnostics.items));
			}
		}
	}

	function getEmbeddedDocumentUri(uri: vscode.Uri) {
		const sourceDocumentUri = virtualDocUriToSourceDocUri.get(uri.toString())!;
		return vscode.Uri.from({
			scheme: 'volar-embedded-content',
			authority: encodeURIComponent(sourceDocumentUri.virtualCodeId),
			path: '/' + encodeURIComponent(sourceDocumentUri.fileUri),
		});
	}

	function updateDecorations() {
		for (const [_, sources] of virtualUriToSourceMap) {
			for (const [sourceUri] of sources) {
				const sourceEditor = vscode.window.visibleTextEditors.find(editor =>
					editor.document.uri.toString() === sourceUri
				);
				if (sourceEditor) {
					sourceEditor.setDecorations(mappingDecorationType, []);
					sourceEditor.setDecorations(mappingSelectionDecorationType, []);
					sourceEditor.setDecorations(mappingCursorDecorationType, []);
				}
			}
		}
		for (const [virtualUri, sources] of virtualUriToSourceMap) {
			const virtualEditor = vscode.window.visibleTextEditors.find(editor =>
				editor.document.uri.toString() === virtualUri
			);
			let virtualRanges1: vscode.Range[] = [];
			let virtualRanges2: vscode.Range[] = [];
			let virtualRanges3: vscode.Range[] = [];

			if (virtualEditor) {
				for (const [sourceUri, map] of sources) {
					const sourceEditor = vscode.window.visibleTextEditors.find(editor =>
						editor.document.uri.toString() === sourceUri
					);
					if (sourceEditor) {
						const mappingDecorationRanges = map.mappings
							.map(mapping =>
								mapping.sourceOffsets.map((offset, i) =>
									new vscode.Range(
										sourceEditor.document.positionAt(offset),
										sourceEditor.document.positionAt(offset + mapping.lengths[i]),
									)
								)
							)
							.flat();
						sourceEditor.setDecorations(mappingDecorationType, mappingDecorationRanges);
						virtualRanges1 = virtualRanges1.concat(
							map.mappings
								.map(mapping =>
									mapping.generatedOffsets.map((offset, i) =>
										new vscode.Range(
											getGeneratedPosition(virtualUri, offset),
											getGeneratedPosition(virtualUri, offset + (mapping.generatedLengths ?? mapping.lengths)[i]),
										)
									)
								)
								.flat(),
						);

						/**
						 * selection
						 */
						if (vscode.window.activeTextEditor) {
							const selection = vscode.window.activeTextEditor.selection;
							const startOffset = vscode.window.activeTextEditor.document.offsetAt(selection.start);
							const endOffset = vscode.window.activeTextEditor.document.offsetAt(selection.end);

							if (vscode.window.activeTextEditor === sourceEditor) {
								const mappedStarts = [...map.toGeneratedLocation(startOffset)];
								const mappedEnds = [...map.toGeneratedLocation(endOffset)];

								sourceEditor.setDecorations(
									mappingSelectionDecorationType,
									mappedStarts
										.map(([_, mapping]) =>
											mapping.sourceOffsets.map((offset, i) =>
												new vscode.Range(
													sourceEditor.document.positionAt(offset),
													sourceEditor.document.positionAt(offset + mapping.lengths[i]),
												)
											)
										)
										.flat(),
								);

								virtualRanges2 = virtualRanges2.concat(
									mappedStarts
										.map(([_, mapping]) =>
											mapping.generatedOffsets.map((offset, i) =>
												new vscode.Range(
													getGeneratedPosition(virtualUri, offset),
													getGeneratedPosition(virtualUri, offset + (mapping.generatedLengths ?? mapping.lengths)[i]),
												)
											)
										)
										.flat(),
								);
								virtualRanges3 = virtualRanges3.concat(
									mappedStarts.map(mapped =>
										new vscode.Range(
											getGeneratedPosition(virtualUri, mapped[0]),
											getGeneratedPosition(
												virtualUri,
												mappedEnds.find(mapped2 => mapped[1] === mapped2[1])?.[0] ?? mapped[0],
											),
										)
									),
								);

								if (virtualRanges3.length) {
									virtualEditor.revealRange(virtualRanges3[0]);
								}
							}
							else if (vscode.window.activeTextEditor === virtualEditor) {
								const mappedStarts = [...map.toSourceLocation(startOffset)];
								const mappedEnds = [...map.toSourceLocation(endOffset)];

								const sourceRanges2 = mappedStarts
									.map(([_, mapping]) =>
										mapping.sourceOffsets.map((offset, i) =>
											new vscode.Range(
												sourceEditor.document.positionAt(offset),
												sourceEditor.document.positionAt(offset + mapping.lengths[i]),
											)
										)
									)
									.flat();
								const sourceRanges3 = mappedStarts.map(mapped =>
									new vscode.Range(
										sourceEditor.document.positionAt(mapped[0]),
										sourceEditor.document.positionAt(
											mappedEnds.find(mapped2 => mapped[1] === mapped2[1])?.[0] ?? mapped[0],
										),
									)
								);

								sourceEditor.setDecorations(mappingSelectionDecorationType, sourceRanges2);
								sourceEditor.setDecorations(mappingCursorDecorationType, sourceRanges3);

								virtualRanges2 = virtualRanges2.concat(
									mappedStarts
										.map(([_, mapping]) =>
											mapping.generatedOffsets.map((offset, i) =>
												new vscode.Range(
													getGeneratedPosition(virtualUri, offset),
													getGeneratedPosition(virtualUri, offset + (mapping.generatedLengths ?? mapping.lengths)[i]),
												)
											)
										)
										.flat(),
								);

								if (sourceRanges3.length) {
									sourceEditor.revealRange(sourceRanges3[0]);
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
