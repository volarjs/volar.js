import { CodeActionTriggerKind, Diagnostic, DiagnosticSeverity, DidChangeWatchedFilesParams, FileChangeType, LanguagePlugin, NotificationHandler, LanguageServicePlugin, LanguageServiceEnvironment, createLanguageService, mergeWorkspaceEdits, createLanguage, createUriMap } from '@volar/language-service';
import * as path from 'typesafe-path/posix';
import * as ts from 'typescript';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createServiceEnvironment } from './createServiceEnvironment';
import { asPosix, defaultCompilerOptions, asUri, asFileName } from './utils';
import { URI } from 'vscode-uri';
import { TypeScriptProjectHost, createLanguageServiceHost, resolveFileLanguageId } from '@volar/typescript';

export function createTypeScriptChecker(
	languagePlugins: LanguagePlugin<URI>[],
	languageServicePlugins: LanguageServicePlugin[],
	tsconfig: string
) {
	const tsconfigPath = asPosix(tsconfig);
	return createTypeScriptCheckerWorker(languagePlugins, languageServicePlugins, tsconfigPath, env => {
		return createTypeScriptProjectHost(
			env,
			() => {
				const parsed = ts.parseJsonSourceFileConfigFileContent(
					ts.readJsonConfigFile(tsconfigPath, ts.sys.readFile),
					ts.sys,
					path.dirname(tsconfigPath),
					undefined,
					tsconfigPath,
					undefined,
					languagePlugins.map(plugin => plugin.typescript?.extraFileExtensions ?? []).flat()
				);
				parsed.fileNames = parsed.fileNames.map(asPosix);
				return parsed;
			}
		);
	});
}

export function createTypeScriptInferredChecker(
	languagePlugins: LanguagePlugin<URI>[],
	languageServicePlugins: LanguageServicePlugin[],
	getScriptFileNames: () => string[],
	compilerOptions = defaultCompilerOptions
) {
	return createTypeScriptCheckerWorker(languagePlugins, languageServicePlugins, undefined, env => {
		return createTypeScriptProjectHost(
			env,
			() => ({
				options: compilerOptions,
				fileNames: getScriptFileNames().map(asPosix),
			})
		);
	});
}

const fsFileSnapshots = createUriMap<[number | undefined, ts.IScriptSnapshot | undefined]>();

function createTypeScriptCheckerWorker(
	languagePlugins: LanguagePlugin<URI>[],
	languageServicePlugins: LanguageServicePlugin[],
	configFileName: string | undefined,
	getProjectHost: (env: LanguageServiceEnvironment) => TypeScriptProjectHost
) {

	let settings = {};

	const env = createServiceEnvironment(() => settings);
	const didChangeWatchedFilesCallbacks = new Set<NotificationHandler<DidChangeWatchedFilesParams>>();

	env.onDidChangeWatchedFiles = cb => {
		didChangeWatchedFilesCallbacks.add(cb);
		return {
			dispose: () => {
				didChangeWatchedFilesCallbacks.delete(cb);
			},
		};
	};

	const language = createLanguage(
		[
			...languagePlugins,
			{ getLanguageId: uri => resolveFileLanguageId(uri.path) },
		],
		createUriMap(ts.sys.useCaseSensitiveFileNames),
		uri => {
			// fs files
			const cache = fsFileSnapshots.get(uri);
			const fileName = asFileName(uri);
			const modifiedTime = ts.sys.getModifiedTime?.(fileName)?.valueOf();
			if (!cache || cache[0] !== modifiedTime) {
				if (ts.sys.fileExists(fileName)) {
					const text = ts.sys.readFile(fileName);
					const snapshot = text !== undefined ? ts.ScriptSnapshot.fromString(text) : undefined;
					fsFileSnapshots.set(uri, [modifiedTime, snapshot]);
				}
				else {
					fsFileSnapshots.set(uri, [modifiedTime, undefined]);
				}
			}
			const snapshot = fsFileSnapshots.get(uri)?.[1];
			if (snapshot) {
				language.scripts.set(uri, snapshot);
			}
			else {
				language.scripts.delete(uri);
			}
		}
	);
	const projectHost = getProjectHost(env);
	const languageService = createLanguageService(
		language,
		languageServicePlugins,
		env,
		{
			typescript: {
				configFileName,
				sys: ts.sys,
				uriConverter: {
					asFileName,
					asUri,
				},
				...createLanguageServiceHost(
					ts,
					ts.sys,
					language,
					asUri,
					projectHost
				),
			},
		}
	);

	return {
		// apis
		check,
		fixErrors,
		printErrors,
		projectHost,
		language,

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
			cb({ changes: [{ uri: asUri(fileName).toString(), type }] });
		}
	}

	function check(fileName: string) {
		fileName = asPosix(fileName);
		const uri = asUri(fileName);
		return languageService.getDiagnostics(uri);
	}

	async function fixErrors(fileName: string, diagnostics: Diagnostic[], only: string[] | undefined, writeFile: (fileName: string, newText: string) => Promise<void>) {
		fileName = asPosix(fileName);
		const uri = asUri(fileName);
		const sourceScript = languageService.context.language.scripts.get(uri);
		if (sourceScript) {
			const document = languageService.context.documents.get(uri, sourceScript.languageId, sourceScript.snapshot);
			const range = { start: document.positionAt(0), end: document.positionAt(document.getText().length) };
			const codeActions = await languageService.getCodeActions(uri, range, { diagnostics, only, triggerKind: 1 satisfies typeof CodeActionTriggerKind.Invoked });
			if (codeActions) {
				for (let i = 0; i < codeActions.length; i++) {
					codeActions[i] = await languageService.resolveCodeAction(codeActions[i]);
				}
				const edits = codeActions.map(codeAction => codeAction.edit).filter((edit): edit is NonNullable<typeof edit> => !!edit);
				if (edits.length) {
					const rootEdit = edits[0];
					mergeWorkspaceEdits(rootEdit, ...edits.slice(1));
					for (const uri in rootEdit.changes ?? {}) {
						const edits = rootEdit.changes![uri];
						if (edits.length) {
							const parsedUri = URI.parse(uri);
							const editFile = languageService.context.language.scripts.get(parsedUri);
							if (editFile) {
								const editDocument = languageService.context.documents.get(parsedUri, editFile.languageId, editFile.snapshot);
								const newString = TextDocument.applyEdits(editDocument, edits);
								await writeFile(asFileName(parsedUri), newString);
							}
						}
					}
					for (const change of rootEdit.documentChanges ?? []) {
						if ('textDocument' in change) {
							const changeUri = URI.parse(change.textDocument.uri);
							const editFile = languageService.context.language.scripts.get(changeUri);
							if (editFile) {
								const editDocument = languageService.context.documents.get(changeUri, editFile.languageId, editFile.snapshot);
								const newString = TextDocument.applyEdits(editDocument, change.edits);
								await writeFile(asFileName(changeUri), newString);
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
		const uri = asUri(fileName);
		const sourceScript = languageService.context.language.scripts.get(uri)!;
		const document = languageService.context.documents.get(uri, sourceScript.languageId, sourceScript.snapshot);
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
			getCanonicalFileName: fileName => ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
			getNewLine: () => ts.sys.newLine,
		});
		return text;
	}
}

function createTypeScriptProjectHost(
	env: LanguageServiceEnvironment,
	createParsedCommandLine: () => Pick<ts.ParsedCommandLine, 'options' | 'fileNames'>
) {
	let scriptSnapshotsCache: Map<string, ts.IScriptSnapshot | undefined> = new Map();
	let parsedCommandLine = createParsedCommandLine();
	let projectVersion = 0;
	let shouldCheckRootFiles = false;

	const host: TypeScriptProjectHost = {
		getCurrentDirectory: () => env.workspaceFolders.length
			? asFileName(env.workspaceFolders[0])
			: process.cwd(),
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
		getScriptSnapshot: fileName => {
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
	};

	env.onDidChangeWatchedFiles?.(({ changes }) => {
		for (const change of changes) {
			const changeUri = URI.parse(change.uri);
			const fileName = asFileName(changeUri);
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
