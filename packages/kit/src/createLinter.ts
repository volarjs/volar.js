import { CancellationToken, CodeActionTriggerKind, Config, Diagnostic, DiagnosticSeverity, LanguageServiceHost, TextDocumentEdit, createLanguageService, mergeWorkspaceEdits } from '@volar/language-service';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

const uriToFileName = (uri: string) => URI.parse(uri).fsPath.replace(/\\/g, '/');
const fileNameToUri = (fileName: string) => URI.file(fileName).toString();

export function createLinter(config: Config, host: LanguageServiceHost) {

	const ts = require('typescript') as typeof import('typescript/lib/tsserverlibrary');
	const service = createLanguageService(
		{ typescript: ts },
		{
			uriToFileName,
			fileNameToUri,
			rootUri: URI.file(host.getCurrentDirectory()),
		},
		config,
		host,
	);
	const formatHost: ts.FormatDiagnosticsHost = {
		getCurrentDirectory: () => host.getCurrentDirectory(),
		getCanonicalFileName: (fileName) => host.useCaseSensitiveFileNames?.() ? fileName : fileName.toLowerCase(),
		getNewLine: () => host.getNewLine?.() ?? '\n',
	};

	return {
		check,
		fixErrors,
		formatTsErrors,
	};

	function check(fileName: string) {
		const uri = fileNameToUri(fileName);
		return service.doValidation(uri, 'all');
	}

	async function fixErrors(fileName: string, diagnostics: Diagnostic[], only: string[] | undefined, writeFile: (fileName: string, newText: string) => Promise<void>) {
		const uri = fileNameToUri(fileName);
		const document = service.context.getTextDocument(uri);
		if (document) {
			const range = { start: document.positionAt(0), end: document.positionAt(document.getText().length) };
			const codeActions = await service.doCodeActions(uri, range, { diagnostics, only, triggerKind: CodeActionTriggerKind.Invoked }, CancellationToken.None);
			if (codeActions) {
				for (let i = 0; i < codeActions.length; i++) {
					codeActions[i] = await service.doCodeActionResolve(codeActions[i], CancellationToken.None);
				}
				const edits = codeActions.map(codeAction => codeAction.edit).filter((edit): edit is NonNullable<typeof edit> => !!edit);
				if (edits.length) {
					const rootEdit = edits[0];
					mergeWorkspaceEdits(rootEdit, ...edits.slice(1));
					for (const uri in rootEdit.changes ?? {}) {
						const edits = rootEdit.changes![uri];
						if (edits.length) {
							const editDocument = service.context.getTextDocument(uri);
							if (editDocument) {
								const newString = TextDocument.applyEdits(editDocument, edits);
								await writeFile(uriToFileName(uri), newString);
							}
						}
					}
					for (const change of rootEdit.documentChanges ?? []) {
						if (TextDocumentEdit.is(change)) {
							const editDocument = service.context.getTextDocument(change.textDocument.uri);
							if (editDocument) {
								const newString = TextDocument.applyEdits(editDocument, change.edits);
								await writeFile(uriToFileName(change.textDocument.uri), newString);
							}
						}
						// TODO: CreateFile | RenameFile | DeleteFile
					}
				}
			}
		}
	}

	function formatTsErrors(fileName: string, diagnostics: Diagnostic[]) {
		const uri = fileNameToUri(fileName);
		const document = service.context.getTextDocument(uri)!;
		const errors: ts.Diagnostic[] = diagnostics.map<ts.Diagnostic>(diagnostic => ({
			category: diagnostic.severity === DiagnosticSeverity.Error ? ts.DiagnosticCategory.Error : ts.DiagnosticCategory.Warning,
			code: diagnostic.code as number,
			file: ts.createSourceFile(fileName, document.getText(), ts.ScriptTarget.JSON),
			start: document.offsetAt(diagnostic.range.start),
			length: document.offsetAt(diagnostic.range.end) - document.offsetAt(diagnostic.range.start),
			messageText: diagnostic.message,
		}));
		const text = ts.formatDiagnosticsWithColorAndContext(errors, formatHost);
		return text;
	}
}
