import { CodeInformations } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import * as dedupe from '../utils/dedupe';
import { languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: ServiceContext) {

	return (uri: string, position: vscode.Position, newName: string, token = NoneCancellationToken) => {

		return languageFeatureWorker(
			context,
			uri,
			() => ({ position, newName }),
			function* (map) {

				let _data: CodeInformations = {};

				for (const mappedPosition of map.toGeneratedPositions(position, data => {
					_data = data;
					return typeof data.renameEdits === 'object'
						? data.renameEdits.shouldRename
						: (data.renameEdits ?? true);
				})) {
					let newNewName = newName;
					if (typeof _data.renameEdits === 'object' && _data.renameEdits.resolveNewName) {
						newNewName = _data.renameEdits.resolveNewName(newName);
					}
					yield {
						position: mappedPosition,
						newName: newNewName,
					};
				};
			},
			async (service, document, params) => {

				if (token.isCancellationRequested) {
					return;
				}

				const recursiveChecker = dedupe.createLocationSet();
				let result: vscode.WorkspaceEdit | undefined;

				await withMirrors(document, params.position, params.newName);

				return result;

				async function withMirrors(document: TextDocument, position: vscode.Position, newName: string) {

					if (!service.provideRenameEdits)
						return;

					if (recursiveChecker.has({ uri: document.uri, range: { start: position, end: position } }))
						return;

					recursiveChecker.add({ uri: document.uri, range: { start: position, end: position } });

					const workspaceEdit = await service.provideRenameEdits(document, position, newName, token);

					if (!workspaceEdit)
						return;

					if (!result)
						result = {};

					if (workspaceEdit.changes) {

						for (const editUri in workspaceEdit.changes) {

							const textEdits = workspaceEdit.changes[editUri];

							for (const textEdit of textEdits) {

								let foundMirrorPosition = false;

								recursiveChecker.add({ uri: editUri, range: { start: textEdit.range.start, end: textEdit.range.start } });

								const [virtualFile] = context.project.fileProvider.getVirtualFile(editUri);
								const mirrorMap = virtualFile ? context.documents.getMirrorMap(virtualFile) : undefined;

								if (mirrorMap) {

									for (const mapped of mirrorMap.findMirrorPositions(textEdit.range.start)) {

										if (!(mapped[1].rename ?? true))
											continue;

										if (recursiveChecker.has({ uri: mirrorMap.document.uri, range: { start: mapped[0], end: mapped[0] } }))
											continue;

										foundMirrorPosition = true;

										await withMirrors(mirrorMap.document, mapped[0], newName);
									}
								}

								if (!foundMirrorPosition) {

									if (!result.changes)
										result.changes = {};

									if (!result.changes[editUri])
										result.changes[editUri] = [];

									result.changes[editUri].push(textEdit);
								}
							}
						}
					}

					if (workspaceEdit.changeAnnotations) {

						for (const uri in workspaceEdit.changeAnnotations) {

							if (!result.changeAnnotations)
								result.changeAnnotations = {};

							result.changeAnnotations[uri] = workspaceEdit.changeAnnotations[uri];
						}
					}

					if (workspaceEdit.documentChanges) {

						if (!result.documentChanges)
							result.documentChanges = [];

						result.documentChanges = result.documentChanges.concat(workspaceEdit.documentChanges);
					}
				}
			},
			(data) => {
				return embeddedEditToSourceEdit(
					data,
					context,
					'rename',
				);
			},
			(workspaceEdits) => {

				const mainEdit = workspaceEdits[0];
				const otherEdits = workspaceEdits.slice(1);

				mergeWorkspaceEdits(mainEdit, ...otherEdits);

				if (mainEdit.changes) {
					for (const uri in mainEdit.changes) {
						mainEdit.changes[uri] = dedupe.withTextEdits(mainEdit.changes[uri]);
					}
				}

				return workspaceEdits[0];
			},
		);
	};
}

export function mergeWorkspaceEdits(original: vscode.WorkspaceEdit, ...others: vscode.WorkspaceEdit[]) {
	for (const other of others) {
		for (const uri in other.changeAnnotations) {
			if (!original.changeAnnotations) {
				original.changeAnnotations = {};
			}
			original.changeAnnotations[uri] = other.changeAnnotations[uri];
		}
		for (const uri in other.changes) {
			if (!original.changes) {
				original.changes = {};
			}
			if (!original.changes[uri]) {
				original.changes[uri] = [];
			}
			const edits = other.changes[uri];
			original.changes[uri] = original.changes[uri].concat(edits);
		}
		if (other.documentChanges) {
			if (!original.documentChanges) {
				original.documentChanges = [];
			}
			for (const docChange of other.documentChanges) {
				pushEditToDocumentChanges(original.documentChanges, docChange);
			}
		}
	}
}

export function embeddedEditToSourceEdit(
	tsResult: vscode.WorkspaceEdit,
	{ documents, project }: ServiceContext,
	mode: 'fileName' | 'rename' | 'codeAction' | 'format',
	versions: Record<string, number> = {},
) {

	const sourceResult: vscode.WorkspaceEdit = {};
	let hasResult = false;

	for (const tsUri in tsResult.changeAnnotations) {

		sourceResult.changeAnnotations ??= {};

		const tsAnno = tsResult.changeAnnotations[tsUri];
		const [virtualFile] = project.fileProvider.getVirtualFile(tsUri);

		if (virtualFile) {
			for (const map of documents.getMaps(virtualFile)) {
				// TODO: check capability?
				const uri = map.sourceFileDocument.uri;
				sourceResult.changeAnnotations[uri] = tsAnno;
			}
		}
		else {
			sourceResult.changeAnnotations[tsUri] = tsAnno;
		}
	}
	for (const tsUri in tsResult.changes) {

		sourceResult.changes ??= {};

		const [virtualFile] = project.fileProvider.getVirtualFile(tsUri);

		if (virtualFile) {
			for (const map of documents.getMaps(virtualFile)) {
				const tsEdits = tsResult.changes[tsUri];
				for (const tsEdit of tsEdits) {
					if (mode === 'rename' || mode === 'fileName' || mode === 'codeAction') {

						let _data: CodeInformations | undefined;

						const range = map.toSourceRange(tsEdit.range, data => {
							_data = data;
							return typeof data.renameEdits === 'object'
								? data.renameEdits.shouldEdit
								: (data.renameEdits ?? true);
						});

						if (range) {
							let newText = tsEdit.newText;
							if (_data && typeof _data.renameEdits === 'object' && _data.renameEdits.resolveEditText) {
								newText = _data.renameEdits.resolveEditText(tsEdit.newText);
							}
							sourceResult.changes[map.sourceFileDocument.uri] ??= [];
							sourceResult.changes[map.sourceFileDocument.uri].push({ newText, range });
							hasResult = true;
						}
					}
					else {
						const range = map.toSourceRange(tsEdit.range);
						if (range) {
							sourceResult.changes[map.sourceFileDocument.uri] ??= [];
							sourceResult.changes[map.sourceFileDocument.uri].push({ newText: tsEdit.newText, range });
							hasResult = true;
						}
					}
				}
			}
		}
		else {
			sourceResult.changes[tsUri] = tsResult.changes[tsUri];
			hasResult = true;
		}
	}
	if (tsResult.documentChanges) {
		for (const tsDocEdit of tsResult.documentChanges) {

			sourceResult.documentChanges ??= [];

			let sourceEdit: typeof tsDocEdit | undefined;
			if ('textDocument' in tsDocEdit) {

				const [virtualFile] = project.fileProvider.getVirtualFile(tsDocEdit.textDocument.uri);

				if (virtualFile) {
					for (const map of documents.getMaps(virtualFile)) {
						sourceEdit = {
							textDocument: {
								uri: map.sourceFileDocument.uri,
								version: versions[map.sourceFileDocument.uri] ?? null,
							},
							edits: [],
						} satisfies vscode.TextDocumentEdit;
						for (const tsEdit of tsDocEdit.edits) {
							if (mode === 'rename' || mode === 'fileName' || mode === 'codeAction') {
								let _data: CodeInformations | undefined;
								const range = map.toSourceRange(tsEdit.range, data => {
									_data = data;
									// fix https://github.com/johnsoncodehk/volar/issues/1091
									return typeof data.renameEdits === 'object'
										? data.renameEdits.shouldEdit
										: (data.renameEdits ?? true);
								});
								if (range) {
									let newText = tsEdit.newText;
									if (_data && typeof _data.renameEdits === 'object' && _data.renameEdits.resolveEditText) {
										newText = _data.renameEdits.resolveEditText(tsEdit.newText);
									}
									sourceEdit.edits.push({
										annotationId: 'annotationId' in tsEdit ? tsEdit.annotationId : undefined,
										newText,
										range,
									});
								}
							}
							else {
								const range = map.toSourceRange(tsEdit.range);
								if (range) {
									sourceEdit.edits.push({
										annotationId: 'annotationId' in tsEdit ? tsEdit.annotationId : undefined,
										newText: tsEdit.newText,
										range,
									});
								}
							}
						}
						if (!sourceEdit.edits.length) {
							sourceEdit = undefined;
						}
					}
				}
				else {
					sourceEdit = tsDocEdit;
				}
			}
			else if (tsDocEdit.kind === 'create') {
				sourceEdit = tsDocEdit; // TODO: remove .ts?
			}
			else if (tsDocEdit.kind === 'rename') {

				const [virtualFile] = project.fileProvider.getVirtualFile(tsDocEdit.oldUri);

				if (virtualFile) {
					for (const map of documents.getMaps(virtualFile)) {
						// TODO: check capability?
						sourceEdit = {
							kind: 'rename',
							oldUri: map.sourceFileDocument.uri,
							newUri: tsDocEdit.newUri /* TODO: remove .ts? */,
							options: tsDocEdit.options,
							annotationId: tsDocEdit.annotationId,
						} satisfies vscode.RenameFile;
					}
				}
				else {
					sourceEdit = tsDocEdit;
				}
			}
			else if (tsDocEdit.kind === 'delete') {

				const [virtualFile] = project.fileProvider.getVirtualFile(tsDocEdit.uri);

				if (virtualFile) {
					for (const map of documents.getMaps(virtualFile)) {
						// TODO: check capability?
						sourceEdit = {
							kind: 'delete',
							uri: map.sourceFileDocument.uri,
							options: tsDocEdit.options,
							annotationId: tsDocEdit.annotationId,
						} satisfies vscode.DeleteFile;
					}
				}
				else {
					sourceEdit = tsDocEdit;
				}
			}
			if (sourceEdit) {
				pushEditToDocumentChanges(sourceResult.documentChanges, sourceEdit);
				hasResult = true;
			}
		}
	}
	if (hasResult) {
		return sourceResult;
	}
}

function pushEditToDocumentChanges(arr: NonNullable<vscode.WorkspaceEdit['documentChanges']>, item: NonNullable<vscode.WorkspaceEdit['documentChanges']>[number]) {
	const current = arr.find(edit =>
		'textDocument' in edit
		&& 'textDocument' in item
		&& edit.textDocument.uri === item.textDocument.uri
	) as vscode.TextDocumentEdit | undefined;
	if (current) {
		current.edits.push(...(item as vscode.TextDocumentEdit).edits);
	}
	else {
		arr.push(item);
	}
}
