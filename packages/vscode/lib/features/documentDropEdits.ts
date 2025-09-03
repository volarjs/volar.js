import * as vscode from 'vscode';
import type { BaseLanguageClient } from 'vscode-languageclient';
import {
	DocumentDrop_DataTransferItemAsStringRequest,
	DocumentDrop_DataTransferItemFileDataRequest,
	DocumentDropRequest,
} from '../../protocol.js';

export function activate(selector: vscode.DocumentSelector, client: BaseLanguageClient) {
	let lastDataTransfer: vscode.DataTransfer;

	return vscode.Disposable.from(
		client.onRequest(DocumentDrop_DataTransferItemAsStringRequest.type, async ({ mimeType }) => {
			const item = lastDataTransfer.get(mimeType);
			return await item?.asString() ?? '';
		}),
		client.onRequest(DocumentDrop_DataTransferItemFileDataRequest.type, async ({ mimeType }) => {
			const item = lastDataTransfer.get(mimeType);
			return await item?.asFile()?.data() ?? new Uint8Array();
		}),
		vscode.languages.registerDocumentDropEditProvider(
			selector,
			{
				async provideDocumentDropEdits(document, position, dataTransfer) {
					lastDataTransfer = dataTransfer;

					const result = await client.sendRequest(DocumentDropRequest.type, {
						textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document),
						position: client.code2ProtocolConverter.asPosition(position),
						dataTransfer: [...dataTransfer].map(([mimeType, item]) => {
							const file = item.asFile();
							return {
								mimeType,
								value: item.value,
								file: file
									? {
										name: file.name,
										uri: file.uri ? client.code2ProtocolConverter.asUri(file.uri) : undefined,
									}
									: undefined,
							};
						}),
					});

					if (result) {
						const edit = new vscode.DocumentDropEdit(
							result.insertTextFormat === 2 /* InsertTextMode.Snippet */
								? new vscode.SnippetString(result.insertText)
								: result.insertText,
						);
						if (result.additionalEdit) {
							edit.additionalEdit = await client.protocol2CodeConverter.asWorkspaceEdit(result.additionalEdit);
						}
						if (result.createDataTransferFile) {
							edit.additionalEdit ??= new vscode.WorkspaceEdit();
							for (const create of result.createDataTransferFile) {
								const file = dataTransfer.get(create.contentsMimeType)?.asFile();
								if (file) {
									edit.additionalEdit.createFile(
										client.protocol2CodeConverter.asUri(create.uri),
										{
											ignoreIfExists: create.options?.ignoreIfExists,
											overwrite: create.options?.overwrite,
											contents: await file.data(),
										},
									);
								}
							}
						}
						return edit;
					}
				},
			},
		),
	);
}
