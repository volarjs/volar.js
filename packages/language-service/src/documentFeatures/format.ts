import type { VirtualFile } from '@volar/language-core';
import * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { LanguageServicePluginContext } from '../types';
import * as shared from '@volar/shared';
import { SourceMap } from '@volar/source-map';
import { stringToSnapshot } from '../utils/common';

export function register(context: LanguageServicePluginContext) {

	return async (
		uri: string,
		options: vscode.FormattingOptions,
		range?: vscode.Range,
		onTypeParams?: {
			ch: string,
			position: vscode.Position,
		},
	) => {

		let document = context.getTextDocument(uri);
		if (!document) return;

		range ??= vscode.Range.create(document.positionAt(0), document.positionAt(document.getText().length));

		const initialIndentLanguageId = await context.env.configurationHost?.getConfiguration<Record<string, boolean>>('volar.format.initialIndent') ?? { html: true };
		const source = context.documents.getSourceByUri(document.uri);
		if (!source) {
			return onTypeParams
				? await tryFormat(false, document, onTypeParams.position, onTypeParams.ch)
				: await tryFormat(false, document, range, undefined);
		}

		const originalSnapshot = source.snapshot;
		const rootVirtualFile = source.root;
		const originalDocument = document;

		let level = 0;
		let edited = false;

		while (true) {

			const embeddedFiles = getEmbeddedFilesByLevel(rootVirtualFile, level++);
			if (embeddedFiles.length === 0)
				break;

			let edits: vscode.TextEdit[] = [];
			let toPatchIndentUri: string | undefined;

			for (const embedded of embeddedFiles) {

				if (!embedded.capabilities.documentFormatting)
					continue;

				const maps = [...context.documents.getMapsByVirtualFileName(embedded.fileName)];
				const map = maps.find(map => map[1].sourceFileDocument.uri === document!.uri)?.[1];
				if (!map)
					continue;

				let _edits: vscode.TextEdit[] | undefined;

				if (onTypeParams) {

					const embeddedPosition = map.toGeneratedPosition(onTypeParams.position);

					if (embeddedPosition) {
						_edits = await tryFormat(
							true,
							map.virtualFileDocument,
							embeddedPosition,
							onTypeParams.ch,
						);
					}
				}

				else {

					let genRange = map.toGeneratedRange(range);

					if (!genRange) {
						const firstMapping = map.map.mappings.sort((a, b) => a.sourceRange[0] - b.sourceRange[0])[0];
						const lastMapping = map.map.mappings.sort((a, b) => b.sourceRange[0] - a.sourceRange[0])[0];
						if (
							firstMapping && document.offsetAt(range.start) < firstMapping.sourceRange[0]
							&& lastMapping && document.offsetAt(range.end) > lastMapping.sourceRange[1]
						) {
							genRange = {
								start: map.virtualFileDocument.positionAt(firstMapping.generatedRange[0]),
								end: map.virtualFileDocument.positionAt(lastMapping.generatedRange[1]),
							};
						}
					}

					if (genRange) {

						toPatchIndentUri = map.virtualFileDocument.uri;

						_edits = await tryFormat(true, map.virtualFileDocument, genRange);
					}
				}

				if (!_edits)
					continue;

				for (const textEdit of _edits) {
					const range = map.toSourceRange(textEdit.range);
					if (range) {
						edits.push({
							newText: textEdit.newText,
							range,
						});
					}
				}
			}

			if (edits.length > 0) {
				const newText = TextDocument.applyEdits(document, edits);
				document = TextDocument.create(document.uri, document.languageId, document.version + 1, newText);
				context.core.virtualFiles.updateSource(shared.uriToFileName(document.uri), stringToSnapshot(document.getText()), undefined);
				edited = true;
			}

			if (toPatchIndentUri) {

				for (const [_, map] of context.documents.getMapsByVirtualFileUri(toPatchIndentUri)) {

					const indentEdits = patchInterpolationIndent(document, map.map);

					if (indentEdits.length > 0) {
						const newText = TextDocument.applyEdits(document, indentEdits);
						document = TextDocument.create(document.uri, document.languageId, document.version + 1, newText);
						context.core.virtualFiles.updateSource(shared.uriToFileName(document.uri), stringToSnapshot(document.getText()), undefined);
						edited = true;
					}
				}
			}
		}

		if (edited) {
			// recover
			context.core.virtualFiles.updateSource(shared.uriToFileName(document.uri), originalSnapshot, undefined);
		}

		if (document.getText() === originalDocument.getText())
			return;

		const editRange = vscode.Range.create(
			originalDocument.positionAt(0),
			originalDocument.positionAt(originalDocument.getText().length),
		);
		const textEdit = vscode.TextEdit.replace(editRange, document.getText());

		return [textEdit];

		function getEmbeddedFilesByLevel(rootFile: VirtualFile, level: number) {

			const embeddedFilesByLevel: VirtualFile[][] = [[rootFile]];

			while (true) {

				if (embeddedFilesByLevel.length > level)
					return embeddedFilesByLevel[level];

				let nextLevel: VirtualFile[] = [];

				for (const file of embeddedFilesByLevel[embeddedFilesByLevel.length - 1]) {

					nextLevel = nextLevel.concat(file.embeddedFiles);
				}

				embeddedFilesByLevel.push(nextLevel);
			}
		}

		async function tryFormat(
			isEmbedded: boolean,
			document: TextDocument,
			range: vscode.Range | vscode.Position,
			ch?: string,
		) {

			let formatDocument = document;
			let formatRange = range;

			for (const plugin of Object.values(context.plugins)) {

				let edits: vscode.TextEdit[] | null | undefined;
				let recover: (() => void) | undefined;

				if (formatDocument !== document && isTsDocument(formatDocument) && context.typescript) {
					const formatFileName = shared.uriToFileName(formatDocument.uri);
					const formatSnapshot = stringToSnapshot(formatDocument.getText());
					const host = context.typescript.languageServiceHost;
					const original = {
						getProjectVersion: host.getProjectVersion,
						getScriptVersion: host.getScriptVersion,
						getScriptSnapshot: host.getScriptSnapshot,
					};
					host.getProjectVersion = () => original.getProjectVersion?.() + '-' + formatDocument.version;
					host.getScriptVersion = (fileName) => {
						if (fileName === formatFileName) {
							return original.getScriptVersion?.(fileName) + '-' + formatDocument.version.toString();
						}
						return original.getScriptVersion?.(fileName);
					};
					host.getScriptSnapshot = (fileName) => {
						if (fileName === formatFileName) {
							return formatSnapshot;
						}
						return original.getScriptSnapshot?.(fileName);
					};
					recover = () => {
						host.getProjectVersion = original.getProjectVersion;
						host.getScriptVersion = original.getScriptVersion;
						host.getScriptSnapshot = original.getScriptSnapshot;
					};
				}

				try {
					if (ch !== undefined && vscode.Position.is(formatRange)) {
						edits = await plugin.formatOnType?.(formatDocument, formatRange, ch, options);
					}
					else if (ch === undefined && vscode.Range.is(formatRange)) {
						edits = await plugin.format?.(formatDocument, formatRange, {
							...options,
							initialIndent: isEmbedded ? !!initialIndentLanguageId[formatDocument.languageId] : false,
						});
					}
				}
				catch (err) {
					console.error(err);
				}

				recover?.();

				if (!edits)
					continue;

				return edits;
			}
		}
	};
}

function patchInterpolationIndent(document: TextDocument, map: SourceMap) {

	const indentTextEdits: vscode.TextEdit[] = [];

	for (const mapped of map.mappings) {

		const baseIndent = getBaseIndent(mapped.sourceRange[0]);
		if (baseIndent === '') {
			continue;
		}

		const text = document.getText().substring(mapped.sourceRange[0], mapped.sourceRange[1]);
		if (text.indexOf('\n') === -1) {
			continue;
		}

		const lines = text.split('\n');
		for (let i = 1; i < lines.length; i++) {
			lines[i] = baseIndent + lines[i];
		}

		indentTextEdits.push({
			newText: lines.join('\n'),
			range: {
				start: document.positionAt(mapped.sourceRange[0]),
				end: document.positionAt(mapped.sourceRange[1]),
			},
		});
	}

	return indentTextEdits;

	function getBaseIndent(pos: number) {
		const startPos = document.positionAt(pos);
		const startLineText = document.getText({ start: { line: startPos.line, character: 0 }, end: startPos });
		return startLineText.substring(0, startLineText.length - startLineText.trimStart().length);
	}
}

function isTsDocument(document: TextDocument) {
	return document.languageId === 'javascript' ||
		document.languageId === 'typescript' ||
		document.languageId === 'javascriptreact' ||
		document.languageId === 'typescriptreact';
}
