import { CodeActionTriggerKind, Diagnostic, DiagnosticSeverity, DidChangeWatchedFilesParams, FileChangeType, LanguagePlugin, NotificationHandler, ServicePlugin, ServiceEnvironment, createLanguageService, mergeWorkspaceEdits, resolveCommonLanguageId, TypeScriptProjectHost } from '@volar/language-service';
import * as path from 'typesafe-path/posix';
import * as ts from 'typescript';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createServiceEnvironment } from './createServiceEnvironment';
import { asPosix, defaultCompilerOptions, fileNameToUri, uriToFileName } from './utils';
import { createLanguage } from '@volar/typescript';

export function createTypeScriptChecker(
	languages: LanguagePlugin[],
	services: ServicePlugin[],
	tsconfig: string,
) {
	const tsconfigPath = asPosix(tsconfig);
	return createTypeScriptCheckerWorker(languages, services, tsconfigPath, env => {
		return createTypeScriptLanguageHost(
			env,
			() => {
				const parsed = ts.parseJsonSourceFileConfigFileContent(
					ts.readJsonConfigFile(tsconfigPath, ts.sys.readFile),
					ts.sys,
					path.dirname(tsconfigPath),
					undefined,
					tsconfigPath,
					undefined,
					languages.map(plugin => plugin.typescript?.extraFileExtensions ?? []).flat(),
				);
				parsed.fileNames = parsed.fileNames.map(asPosix);
				return parsed;
			},
		);
	});
}

export function createTypeScriptInferredChecker(
	languages: LanguagePlugin[],
	services: ServicePlugin[],
	getScriptFileNames: () => string[],
	compilerOptions = defaultCompilerOptions
) {
	return createTypeScriptCheckerWorker(languages, services, undefined, env => {
		return createTypeScriptLanguageHost(
			env,
			() => ({
				options: compilerOptions,
				fileNames: getScriptFileNames().map(asPosix),
			}),
		);
	});
}

function createTypeScriptCheckerWorker(
	languages: LanguagePlugin[],
	services: ServicePlugin[],
	configFileName: string | undefined,
	getProjectHost: (env: ServiceEnvironment) => TypeScriptProjectHost
) {

	let settings = {};

	const env = createServiceEnvironment(() => settings);
	const didChangeWatchedFilesCallbacks = new Set<NotificationHandler<DidChangeWatchedFilesParams>>();

	env.onDidChangeWatchedFiles = (cb) => {
		didChangeWatchedFilesCallbacks.add(cb);
		return {
			dispose: () => {
				didChangeWatchedFilesCallbacks.delete(cb);
			},
		};
	};

	const languageHost = getProjectHost(env);
	const language = createLanguage(
		ts,
		ts.sys,
		languages,
		configFileName,
		languageHost,
	);
	const service = createLanguageService(
		language,
		services,
		env,
	);

	return {
		// apis
		check,
		fixErrors,
		printErrors,
		languageHost,

		// settings
		get settings() {
			return settings;
		},
		set settings(v) {
			settings = v;
		},

		// file events
		fileCreated(fileName: string) {
			fileEvent(fileName, 1 satisfies typeof FileChangeType.Created);
		},
		fileUpdated(fileName: string) {
			fileEvent(fileName, 2 satisfies typeof FileChangeType.Changed);
		},
		fileDeleted(fileName: string) {
			fileEvent(fileName, 3 satisfies typeof FileChangeType.Deleted);
		},
	};

	function fileEvent(fileName: string, type: FileChangeType) {
		fileName = asPosix(fileName);
		for (const cb of didChangeWatchedFilesCallbacks) {
			cb({ changes: [{ uri: fileNameToUri(fileName), type }] });
		}
	}

	function check(fileName: string) {
		fileName = asPosix(fileName);
		const uri = fileNameToUri(fileName);
		return service.doValidation(uri);
	}

	async function fixErrors(fileName: string, diagnostics: Diagnostic[], only: string[] | undefined, writeFile: (fileName: string, newText: string) => Promise<void>) {
		fileName = asPosix(fileName);
		const uri = fileNameToUri(fileName);
		const sourceFile = service.context.language.files.getSourceFile(env.uriToFileName(uri));
		if (sourceFile) {
			const document = service.context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);
			const range = { start: document.positionAt(0), end: document.positionAt(document.getText().length) };
			const codeActions = await service.doCodeActions(uri, range, { diagnostics, only, triggerKind: 1 satisfies typeof CodeActionTriggerKind.Invoked });
			if (codeActions) {
				for (let i = 0; i < codeActions.length; i++) {
					codeActions[i] = await service.doCodeActionResolve(codeActions[i]);
				}
				const edits = codeActions.map(codeAction => codeAction.edit).filter((edit): edit is NonNullable<typeof edit> => !!edit);
				if (edits.length) {
					const rootEdit = edits[0];
					mergeWorkspaceEdits(rootEdit, ...edits.slice(1));
					for (const uri in rootEdit.changes ?? {}) {
						const edits = rootEdit.changes![uri];
						if (edits.length) {
							const editFile = service.context.language.files.getSourceFile(env.uriToFileName(uri));
							if (editFile) {
								const editDocument = service.context.documents.get(uri, editFile.languageId, editFile.snapshot);
								const newString = TextDocument.applyEdits(editDocument, edits);
								await writeFile(uriToFileName(uri), newString);
							}
						}
					}
					for (const change of rootEdit.documentChanges ?? []) {
						if ('textDocument' in change) {
							const editFile = service.context.language.files.getSourceFile(env.uriToFileName(change.textDocument.uri));
							if (editFile) {
								const editDocument = service.context.documents.get(change.textDocument.uri, editFile.languageId, editFile.snapshot);
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

	function printErrors(fileName: string, diagnostics: Diagnostic[], rootPath = process.cwd()) {
		let text = formatErrors(fileName, diagnostics, rootPath);
		for (const diagnostic of diagnostics) {
			text = text.replace(`TS${diagnostic.code}`, (diagnostic.source ?? '') + (diagnostic.code ? `(${diagnostic.code})` : ''));
		}
		return text;
	}

	function formatErrors(fileName: string, diagnostics: Diagnostic[], rootPath: string) {
		fileName = asPosix(fileName);
		const uri = fileNameToUri(fileName);
		const sourceFile = service.context.language.files.getSourceFile(env.uriToFileName(uri))!;
		const document = service.context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);
		const errors: ts.Diagnostic[] = diagnostics.map<ts.Diagnostic>(diagnostic => ({
			category: diagnostic.severity === 1 satisfies typeof DiagnosticSeverity.Error ? ts.DiagnosticCategory.Error : ts.DiagnosticCategory.Warning,
			code: diagnostic.code as number,
			file: ts.createSourceFile(fileName, document.getText(), ts.ScriptTarget.JSON),
			start: document.offsetAt(diagnostic.range.start),
			length: document.offsetAt(diagnostic.range.end) - document.offsetAt(diagnostic.range.start),
			messageText: diagnostic.message,
		}));
		const text = ts.formatDiagnosticsWithColorAndContext(errors, {
			getCurrentDirectory: () => rootPath,
			getCanonicalFileName: (fileName) => ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
			getNewLine: () => ts.sys.newLine,
		});
		return text;
	}
}

function createTypeScriptLanguageHost(
	env: ServiceEnvironment,
	createParsedCommandLine: () => Pick<ts.ParsedCommandLine, 'options' | 'fileNames'>
) {

	let scriptSnapshotsCache: Map<string, ts.IScriptSnapshot | undefined> = new Map();
	let parsedCommandLine = createParsedCommandLine();
	let projectVersion = 0;
	let shouldCheckRootFiles = false;

	const host: TypeScriptProjectHost = {
		getCurrentDirectory: () => {
			return env.uriToFileName(env.workspaceFolder.toString());
		},
		getCompilationSettings: () => {
			return parsedCommandLine.options;
		},
		getProjectVersion: () => {
			checkRootFilesUpdate();
			return projectVersion.toString();
		},
		getScriptFileNames: () => {
			checkRootFilesUpdate();
			return parsedCommandLine.fileNames;
		},
		getScriptSnapshot: (fileName) => {
			if (!scriptSnapshotsCache.has(fileName)) {
				const fileText = ts.sys.readFile(fileName, 'utf8');
				if (fileText !== undefined) {
					scriptSnapshotsCache.set(fileName, ts.ScriptSnapshot.fromString(fileText));
				}
				else {
					scriptSnapshotsCache.set(fileName, undefined);
				}
			}
			return scriptSnapshotsCache.get(fileName);
		},
		getLanguageId: resolveCommonLanguageId,
	};

	env.onDidChangeWatchedFiles?.(({ changes }) => {
		for (const change of changes) {
			const fileName = env.uriToFileName(change.uri);
			if (change.type === 2 satisfies typeof FileChangeType.Changed) {
				if (scriptSnapshotsCache.has(fileName)) {
					projectVersion++;
					scriptSnapshotsCache.delete(fileName);
				}
			}
			else if (change.type === 3 satisfies typeof FileChangeType.Deleted) {
				if (scriptSnapshotsCache.has(fileName)) {
					projectVersion++;
					scriptSnapshotsCache.delete(fileName);
					parsedCommandLine.fileNames = parsedCommandLine.fileNames.filter(name => name !== fileName);
				}
			}
			else if (change.type === 1 satisfies typeof FileChangeType.Created) {
				shouldCheckRootFiles = true;
			}
		}
	});

	return host;

	function checkRootFilesUpdate() {

		if (!shouldCheckRootFiles) {
			return;
		}
		shouldCheckRootFiles = false;

		const newParsedCommandLine = createParsedCommandLine();
		if (!arrayItemsEqual(newParsedCommandLine.fileNames, parsedCommandLine.fileNames)) {
			parsedCommandLine.fileNames = newParsedCommandLine.fileNames;
			projectVersion++;
		}
	}
}

function arrayItemsEqual(a: string[], b: string[]) {
	if (a.length !== b.length) {
		return false;
	}
	const set = new Set(a);
	for (const file of b) {
		if (!set.has(file)) {
			return false;
		}
	}
	return true;
}
