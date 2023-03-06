import { CodeActionTriggerKind, createLanguageService, Diagnostic, DiagnosticSeverity, FormattingOptions, Config, LanguageServiceHost, mergeWorkspaceEdits, CancellationToken } from '@volar/language-service';
import * as fs from 'fs';
import * as path from 'path';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

const uriToFileName = (uri: string) => URI.parse(uri).fsPath.replace(/\\/g, '/');
const fileNameToUri = (fileName: string) => URI.file(fileName).toString();

export function create(
	tsConfigPath: string,
	config: Config,
	extraFileExtensions: ts.FileExtensionInfo[] = [],
	ts: typeof import('typescript/lib/tsserverlibrary') = require('typescript') as any,
) {

	let projectVersion = 0;
	const scriptVersions = new Map<string, number>();
	const scriptSnapshots = new Map<string, ts.IScriptSnapshot>();
	const jsonConfig = ts.readJsonConfigFile(tsConfigPath, ts.sys.readFile);
	const parsedCommandLine = ts.parseJsonSourceFileConfigFileContent(jsonConfig, ts.sys, path.dirname(tsConfigPath), {}, tsConfigPath, undefined, extraFileExtensions);
	const host: LanguageServiceHost = {
		...ts.sys,
		getProjectVersion: () => projectVersion.toString(),
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
		getCompilationSettings: () => parsedCommandLine.options,
		getScriptFileNames: () => parsedCommandLine.fileNames,
		getProjectReferences: () => parsedCommandLine.projectReferences,
		getScriptVersion: (fileName) => scriptVersions.get(fileName)?.toString() ?? '',
		getScriptSnapshot: (fileName) => {
			if (!scriptSnapshots.has(fileName)) {
				const fileText = ts.sys.readFile(fileName);
				if (fileText !== undefined) {
					scriptSnapshots.set(fileName, ts.ScriptSnapshot.fromString(fileText));
				}
			}
			return scriptSnapshots.get(fileName);
		},
		getTypeScriptModule: () => ts,
	};
	const service = createLanguageService({
		host,
		config,
		uriToFileName,
		fileNameToUri,
		rootUri: URI.file(path.dirname(tsConfigPath)),
	});
	const formatHost: ts.FormatDiagnosticsHost = {
		getCurrentDirectory: () => host.getCurrentDirectory(),
		getCanonicalFileName: (fileName) => host.useCaseSensitiveFileNames?.() ? fileName : fileName.toLowerCase(),
		getNewLine: () => host.getNewLine?.() ?? '\n',
	};

	return {
		roots: parsedCommandLine.fileNames,
		lint,
		format,
	};

	async function lint(fileName: string, severity: DiagnosticSeverity = DiagnosticSeverity.Hint, throwLevel: DiagnosticSeverity = 0 as DiagnosticSeverity) {
		const uri = fileNameToUri(fileName);
		const document = service.context.getTextDocument(uri);
		let diagnostics: Diagnostic[] = [];
		if (document) {
			diagnostics = await service.doValidation(uri, 'all');
			diagnostics = diagnostics.filter(diagnostic => (diagnostic.severity ?? 1) <= severity);
			const errors: ts.Diagnostic[] = diagnostics.map<ts.Diagnostic>(diagnostic => ({
				category: diagnostic.severity === DiagnosticSeverity.Error ? ts.DiagnosticCategory.Error : ts.DiagnosticCategory.Warning,
				code: diagnostic.code as number,
				file: ts.createSourceFile(fileName, document.getText(), ts.ScriptTarget.JSON),
				start: document.offsetAt(diagnostic.range.start),
				length: document.offsetAt(diagnostic.range.end) - document.offsetAt(diagnostic.range.start),
				messageText: diagnostic.message,
			}));
			const text = ts.formatDiagnosticsWithColorAndContext(errors, formatHost);
			if (text) {
				if (diagnostics.some(diagnostic => (diagnostic.severity ?? 1) <= throwLevel)) {
					throw text;
				}
				else {
					console.log(text);
				}
			}
		}
		return async (crossFileFix = false) => {
			const document = service.context.getTextDocument(uri);
			if (document) {
				const range = { start: document.positionAt(0), end: document.positionAt(document.getText().length) };
				const codeActions = await service.doCodeActions(uri, range, { diagnostics, only: ['source.fixAll'], triggerKind: CodeActionTriggerKind.Invoked }, CancellationToken.None);
				if (codeActions) {
					for (let i = 0; i < codeActions.length; i++) {
						codeActions[i] = await service.doCodeActionResolve(codeActions[i], CancellationToken.None);
					}
					const edits = codeActions.map(codeAction => codeAction.edit).filter((edit): edit is NonNullable<typeof edit> => !!edit);
					if (edits.length) {
						const rootEdit = edits[0];
						mergeWorkspaceEdits(rootEdit, ...edits.slice(1));
						for (const uri in rootEdit.changes ?? {}) {
							if (uri === document.uri || crossFileFix) {
								const edits = rootEdit.changes![uri];
								if (edits.length) {
									const editDocument = service.context.getTextDocument(uri);
									if (editDocument) {
										const newString = TextDocument.applyEdits(editDocument, edits);
										writeFile(uriToFileName(uri), newString);
									}
								}
							}
						}
						if (crossFileFix) {
							// TODO: rootEdit.documentChanges
						}
					}
				}
			}
		};
	}

	async function format(fileName: string, options: FormattingOptions) {
		const uri = fileNameToUri(fileName);
		const document = service.context.getTextDocument(uri);
		if (document) {
			const edits = await service.format(uri, options, undefined, undefined, CancellationToken.None);
			if (edits?.length) {
				const newString = TextDocument.applyEdits(document, edits);
				writeFile(fileName, newString);
			}
		}
	}
}

function writeFile(fileName: string, newText: string) {
	fs.writeFileSync(fileName, newText, { encoding: 'utf8' });
}
