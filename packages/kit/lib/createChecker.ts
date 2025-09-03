import {
	type CodeActionTriggerKind,
	createLanguage,
	createLanguageService,
	createUriMap,
	type Diagnostic,
	type DiagnosticSeverity,
	type DidChangeWatchedFilesParams,
	type FileChangeType,
	type Language,
	type LanguagePlugin,
	type LanguageServiceEnvironment,
	type LanguageServicePlugin,
	mergeWorkspaceEdits,
	type NotificationHandler,
	type ProjectContext,
} from '@volar/language-service';
import { createLanguageServiceHost, resolveFileLanguageId, type TypeScriptProjectHost } from '@volar/typescript';
import * as path from 'typesafe-path/posix';
import * as ts from 'typescript';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { createServiceEnvironment } from './createServiceEnvironment';
import { asFileName, asPosix, asUri, defaultCompilerOptions } from './utils';

export function createTypeScriptChecker(
	languagePlugins: LanguagePlugin<URI>[],
	languageServicePlugins: LanguageServicePlugin[],
	tsconfig: string,
	includeProjectReference = false,
	setup?: (options: {
		language: Language;
		project: ProjectContext;
	}) => void,
) {
	const tsconfigPath = asPosix(tsconfig);
	return createTypeScriptCheckerWorker(
		languagePlugins,
		languageServicePlugins,
		tsconfigPath,
		() => {
			return ts.parseJsonSourceFileConfigFileContent(
				ts.readJsonConfigFile(tsconfigPath, ts.sys.readFile),
				ts.sys,
				path.dirname(tsconfigPath),
				undefined,
				tsconfigPath,
				undefined,
				languagePlugins.map(plugin => plugin.typescript?.extraFileExtensions ?? []).flat(),
			);
		},
		includeProjectReference,
		setup,
	);
}

export function createTypeScriptInferredChecker(
	languagePlugins: LanguagePlugin<URI>[],
	languageServicePlugins: LanguageServicePlugin[],
	getScriptFileNames: () => string[],
	compilerOptions = defaultCompilerOptions,
	setup?: (options: {
		language: Language;
		project: ProjectContext;
	}) => void,
) {
	return createTypeScriptCheckerWorker(
		languagePlugins,
		languageServicePlugins,
		undefined,
		() => {
			return {
				options: compilerOptions,
				fileNames: getScriptFileNames(),
				errors: [],
			};
		},
		false,
		setup,
	);
}

const fsFileSnapshots = createUriMap<[number | undefined, ts.IScriptSnapshot | undefined]>();

function createTypeScriptCheckerWorker(
	languagePlugins: LanguagePlugin<URI>[],
	languageServicePlugins: LanguageServicePlugin[],
	configFileName: string | undefined,
	getCommandLine: () => ts.ParsedCommandLine,
	includeProjectReference: boolean,
	setup:
		| ((options: {
			language: Language;
			project: ProjectContext;
		}) => void)
		| undefined,
) {
	let settings = {};

	const didChangeWatchedFilesCallbacks = new Set<NotificationHandler<DidChangeWatchedFilesParams>>();
	const env = createServiceEnvironment(() => settings);
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
		(uri, includeFsFiles) => {
			if (!includeFsFiles) {
				return;
			}
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
		},
	);
	const [projectHost, languageService] = createTypeScriptCheckerLanguageService(
		env,
		language,
		languageServicePlugins,
		configFileName,
		getCommandLine,
		setup,
	);
	const projectReferenceLanguageServices = new Map<string, ReturnType<typeof createTypeScriptCheckerLanguageService>>();

	if (includeProjectReference) {
		const tsconfigs = new Set<string>();
		const tsLs: ts.LanguageService = languageService.context.inject('typescript/languageService');
		const projectReferences = tsLs.getProgram()?.getResolvedProjectReferences();
		if (configFileName) {
			tsconfigs.add(asPosix(configFileName));
		}
		projectReferences?.forEach(visit);

		function visit(ref: ts.ResolvedProjectReference | undefined) {
			if (ref && !tsconfigs.has(ref.sourceFile.fileName)) {
				tsconfigs.add(ref.sourceFile.fileName);
				const projectReferenceLanguageService = createTypeScriptCheckerLanguageService(
					env,
					language,
					languageServicePlugins,
					ref.sourceFile.fileName,
					() => ref.commandLine,
					setup,
				);
				projectReferenceLanguageServices.set(ref.sourceFile.fileName, projectReferenceLanguageService);
				ref.references?.forEach(visit);
			}
		}
	}

	return {
		// apis
		check,
		fixErrors,
		printErrors,
		getRootFileNames: () => {
			const fileNames = projectHost.getScriptFileNames();
			for (const [projectHost] of projectReferenceLanguageServices.values()) {
				fileNames.push(...projectHost.getScriptFileNames());
			}
			return [...new Set(fileNames)];
		},
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
		const languageService = getLanguageServiceForFile(fileName);
		return languageService.getDiagnostics(uri);
	}

	async function fixErrors(
		fileName: string,
		diagnostics: Diagnostic[],
		only: string[] | undefined,
		writeFile: (fileName: string, newText: string) => Promise<void>,
	) {
		fileName = asPosix(fileName);
		const uri = asUri(fileName);
		const languageService = getLanguageServiceForFile(fileName);
		const sourceScript = languageService.context.language.scripts.get(uri);
		if (sourceScript) {
			const document = languageService.context.documents.get(uri, sourceScript.languageId, sourceScript.snapshot);
			const range = { start: document.positionAt(0), end: document.positionAt(document.getText().length) };
			const codeActions = await languageService.getCodeActions(uri, range, {
				diagnostics,
				only,
				triggerKind: 1 satisfies typeof CodeActionTriggerKind.Invoked,
			});
			if (codeActions) {
				for (let i = 0; i < codeActions.length; i++) {
					codeActions[i] = await languageService.resolveCodeAction(codeActions[i]);
				}
				const edits = codeActions.map(codeAction => codeAction.edit).filter((edit): edit is NonNullable<typeof edit> =>
					!!edit
				);
				if (edits.length) {
					const rootEdit = edits[0];
					mergeWorkspaceEdits(rootEdit, ...edits.slice(1));
					for (const uri in rootEdit.changes ?? {}) {
						const edits = rootEdit.changes![uri];
						if (edits.length) {
							const parsedUri = URI.parse(uri);
							const editFile = languageService.context.language.scripts.get(parsedUri);
							if (editFile) {
								const editDocument = languageService.context.documents.get(
									parsedUri,
									editFile.languageId,
									editFile.snapshot,
								);
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
								const editDocument = languageService.context.documents.get(
									changeUri,
									editFile.languageId,
									editFile.snapshot,
								);
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
			text = text.replace(
				`TS${diagnostic.code}`,
				(diagnostic.source ?? '') + (diagnostic.code ? `(${diagnostic.code})` : ''),
			);
		}
		return text;
	}

	function formatErrors(fileName: string, diagnostics: Diagnostic[], rootPath: string) {
		fileName = asPosix(fileName);
		const uri = asUri(fileName);
		const languageService = getLanguageServiceForFile(fileName);
		const sourceScript = languageService.context.language.scripts.get(uri)!;
		const document = languageService.context.documents.get(uri, sourceScript.languageId, sourceScript.snapshot);
		const errors: ts.Diagnostic[] = diagnostics.map<ts.Diagnostic>(diagnostic => ({
			category: diagnostic.severity === 1 satisfies typeof DiagnosticSeverity.Error
				? ts.DiagnosticCategory.Error
				: ts.DiagnosticCategory.Warning,
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

	function getLanguageServiceForFile(fileName: string) {
		if (!includeProjectReference) {
			return languageService;
		}
		fileName = asPosix(fileName);
		for (const [_1, languageService] of projectReferenceLanguageServices.values()) {
			const tsLs: ts.LanguageService = languageService.context.inject('typescript/languageService');
			if (tsLs.getProgram()?.getSourceFile(fileName)) {
				return languageService;
			}
		}
		return languageService;
	}
}

function createTypeScriptCheckerLanguageService(
	env: LanguageServiceEnvironment,
	language: Language<URI>,
	languageServicePlugins: LanguageServicePlugin[],
	configFileName: string | undefined,
	getCommandLine: () => ts.ParsedCommandLine,
	setup:
		| ((options: {
			language: Language;
			project: ProjectContext;
		}) => void)
		| undefined,
) {
	let commandLine = getCommandLine();
	let projectVersion = 0;
	let shouldCheckRootFiles = false;

	const resolvedFileNameByCommandLine = new WeakMap<ts.ParsedCommandLine, string[]>();
	const projectHost: TypeScriptProjectHost = {
		getCurrentDirectory: () =>
			env.workspaceFolders.length
				? asFileName(env.workspaceFolders[0])
				: process.cwd(),
		getCompilationSettings: () => {
			return commandLine.options;
		},
		getProjectReferences: () => {
			return commandLine.projectReferences;
		},
		getProjectVersion: () => {
			checkRootFilesUpdate();
			return projectVersion.toString();
		},
		getScriptFileNames: () => {
			checkRootFilesUpdate();
			let fileNames = resolvedFileNameByCommandLine.get(commandLine);
			if (!fileNames) {
				fileNames = commandLine.fileNames.map(asPosix);
				resolvedFileNameByCommandLine.set(commandLine, fileNames);
			}
			return fileNames;
		},
	};
	const project: ProjectContext = {
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
				projectHost,
			),
		},
	};
	setup?.({ language, project });
	const languageService = createLanguageService(
		language,
		languageServicePlugins,
		env,
		project,
	);

	env.onDidChangeWatchedFiles?.(({ changes }) => {
		const tsLs: ts.LanguageService = languageService.context.inject('typescript/languageService');
		const program = tsLs.getProgram();
		for (const change of changes) {
			const changeUri = URI.parse(change.uri);
			const fileName = asFileName(changeUri);
			if (change.type === 2 satisfies typeof FileChangeType.Changed) {
				if (program?.getSourceFile(fileName)) {
					projectVersion++;
				}
			}
			else if (change.type === 3 satisfies typeof FileChangeType.Deleted) {
				if (program?.getSourceFile(fileName)) {
					projectVersion++;
					shouldCheckRootFiles = true;
					break;
				}
			}
			else if (change.type === 1 satisfies typeof FileChangeType.Created) {
				shouldCheckRootFiles = true;
				break;
			}
		}
	});

	return [projectHost, languageService] as const;

	function checkRootFilesUpdate() {
		if (!shouldCheckRootFiles) {
			return;
		}
		shouldCheckRootFiles = false;

		const newCommandLine = getCommandLine();
		if (!arrayItemsEqual(newCommandLine.fileNames, commandLine.fileNames)) {
			commandLine.fileNames = newCommandLine.fileNames;
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
