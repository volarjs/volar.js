import {
	createLanguage,
	createLanguageService,
	createUriMap,
	type Language,
	type LanguagePlugin,
	type LanguageService,
	type LanguageServiceEnvironment,
	type ProjectContext,
	type ProviderResult,
} from '@volar/language-service';
import {
	createLanguageServiceHost,
	createSys,
	resolveFileLanguageId,
	type TypeScriptProjectHost,
} from '@volar/typescript';
import { matchFiles } from '@volar/typescript/lib/typescript/utilities';
import * as path from 'path-browserify';
import type * as ts from 'typescript';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import type { LanguageServer } from '../types';
import type { SnapshotDocument } from '../utils/snapshotDocument';

export interface TypeScriptProjectLS {
	tryAddFile(fileName: string): void;
	getCommandLine(): ts.ParsedCommandLine;
	languageService: LanguageService;
	dispose(): void;
}

export interface ProjectExposeContext {
	env: LanguageServiceEnvironment;
	configFileName: string | undefined;
	projectHost: TypeScriptProjectHost;
	sys: ReturnType<typeof createSys>;
	uriConverter: {
		asUri(fileName: string): URI;
		asFileName(uri: URI): string;
	};
}

const fsFileSnapshots = createUriMap<[number | undefined, ts.IScriptSnapshot | undefined]>();

export async function createTypeScriptLS(
	ts: typeof import('typescript'),
	tsLocalized: ts.MapLike<string> | undefined,
	tsconfig: string | ts.CompilerOptions,
	server: LanguageServer,
	serviceEnv: LanguageServiceEnvironment,
	workspaceFolder: URI,
	uriConverter: {
		asUri(fileName: string): URI;
		asFileName(uri: URI): string;
	},
	create: (projectContext: ProjectExposeContext) => ProviderResult<{
		languagePlugins: LanguagePlugin<URI>[];
		setup?(options: {
			language: Language;
			project: ProjectContext;
		}): void;
	}>,
): Promise<TypeScriptProjectLS> {
	let commandLine: ts.ParsedCommandLine;
	let projectVersion = 0;

	const getCurrentDirectory = () => uriConverter.asFileName(workspaceFolder);
	const sys = createSys(ts.sys, serviceEnv, getCurrentDirectory, uriConverter);
	const projectHost: TypeScriptProjectHost = {
		getCurrentDirectory,
		getProjectVersion() {
			return projectVersion.toString();
		},
		getScriptFileNames() {
			return commandLine.fileNames;
		},
		getCompilationSettings() {
			return commandLine.options;
		},
		getLocalizedDiagnosticMessages: tsLocalized ? () => tsLocalized : undefined,
		getProjectReferences() {
			return commandLine.projectReferences;
		},
	};
	const { languagePlugins, setup } = await create({
		env: serviceEnv,
		configFileName: typeof tsconfig === 'string' ? tsconfig : undefined,
		projectHost,
		sys,
		uriConverter,
	});
	const unsavedRootFileUris = createUriMap();
	const disposables = [
		server.documents.onDidOpen(({ document }) => updateFsCacheFromSyncedDocument(document)),
		server.documents.onDidSave(({ document }) => updateFsCacheFromSyncedDocument(document)),
		server.documents.onDidChangeContent(() => projectVersion++),
		serviceEnv.onDidChangeWatchedFiles?.(async ({ changes }) => {
			const createdOrDeleted = changes.some(change => change.type !== vscode.FileChangeType.Changed);
			if (createdOrDeleted) {
				await updateCommandLine();
			}
			projectVersion++;
		}),
		server.documents.onDidOpen(async ({ document }) => {
			const uri = URI.parse(document.uri);
			const isWorkspaceFile = workspaceFolder.scheme === uri.scheme;
			if (!isWorkspaceFile) {
				return;
			}
			const stat = await serviceEnv.fs?.stat(uri);
			const isUnsaved = stat?.type !== 1;
			if (isUnsaved) {
				const lastProjectVersion = projectVersion;
				await updateCommandLine();
				if (lastProjectVersion !== projectVersion) {
					unsavedRootFileUris.set(uri, true);
				}
			}
		}),
		server.documents.onDidClose(async ({ document }) => {
			const uri = URI.parse(document.uri);
			if (unsavedRootFileUris.has(uri)) {
				unsavedRootFileUris.delete(uri);
				await updateCommandLine();
			}
		}),
	].filter(d => !!d);

	await updateCommandLine();

	const language = createLanguage<URI>(
		[
			{ getLanguageId: uri => server.documents.get(uri)?.languageId },
			...languagePlugins,
			{ getLanguageId: uri => resolveFileLanguageId(uri.path) },
		],
		createUriMap(sys.useCaseSensitiveFileNames),
		(uri, includeFsFiles) => {
			const syncedDocument = server.documents.get(uri);

			let snapshot: ts.IScriptSnapshot | undefined;

			if (syncedDocument) {
				snapshot = syncedDocument.getSnapshot();
			}
			else if (includeFsFiles) {
				const cache = fsFileSnapshots.get(uri);
				const fileName = uriConverter.asFileName(uri);
				const modifiedTime = sys.getModifiedTime?.(fileName)?.valueOf();
				if (!cache || cache[0] !== modifiedTime) {
					if (sys.fileExists(fileName)) {
						const text = sys.readFile(fileName);
						const snapshot = text !== undefined ? ts.ScriptSnapshot.fromString(text) : undefined;
						fsFileSnapshots.set(uri, [modifiedTime, snapshot]);
					}
					else {
						fsFileSnapshots.set(uri, [modifiedTime, undefined]);
					}
				}
				snapshot = fsFileSnapshots.get(uri)?.[1];
			}

			if (snapshot) {
				language.scripts.set(uri, snapshot);
			}
			else {
				language.scripts.delete(uri);
			}
		},
	);
	const project: ProjectContext = {
		typescript: {
			configFileName: typeof tsconfig === 'string' ? tsconfig : undefined,
			sys,
			uriConverter,
			...createLanguageServiceHost(
				ts,
				sys,
				language,
				s => uriConverter.asUri(s),
				projectHost,
			),
		},
	};
	setup?.({ language, project });
	const languageService = createLanguageService(
		language,
		server.languageServicePlugins,
		serviceEnv,
		project,
	);

	return {
		languageService,
		tryAddFile(fileName: string) {
			if (!commandLine.fileNames.includes(fileName)) {
				commandLine.fileNames.push(fileName);
				projectVersion++;
			}
		},
		dispose: () => {
			sys.dispose();
			languageService?.dispose();
			disposables.forEach(({ dispose }) => dispose());
			disposables.length = 0;
		},
		getCommandLine: () => commandLine,
	};

	function updateFsCacheFromSyncedDocument(document: SnapshotDocument) {
		const uri = URI.parse(document.uri);
		const fileName = uriConverter.asFileName(uri);
		if (fsFileSnapshots.has(uri) || sys.fileExists(fileName)) {
			const modifiedTime = sys.getModifiedTime?.(fileName);
			fsFileSnapshots.set(uri, [modifiedTime?.valueOf(), document.getSnapshot()]);
		}
	}

	async function updateCommandLine() {
		const oldFileNames = new Set(commandLine?.fileNames ?? []);
		commandLine = await parseConfig(
			ts,
			sys,
			uriConverter.asFileName(workspaceFolder),
			tsconfig,
			languagePlugins.map(plugin => plugin.typescript?.extraFileExtensions ?? []).flat(),
		);
		const newFileNames = new Set(commandLine.fileNames);
		if (oldFileNames.size !== newFileNames.size || [...oldFileNames].some(fileName => !newFileNames.has(fileName))) {
			projectVersion++;
		}
	}

	async function parseConfig(
		ts: typeof import('typescript'),
		sys: ReturnType<typeof createSys>,
		workspacePath: string,
		tsconfig: string | ts.CompilerOptions,
		extraFileExtensions: ts.FileExtensionInfo[],
	) {
		let commandLine: ts.ParsedCommandLine = {
			errors: [],
			fileNames: [],
			options: {},
		};
		let sysVersion: number | undefined;
		let newSysVersion = await sys.sync();
		while (sysVersion !== newSysVersion) {
			sysVersion = newSysVersion;
			try {
				commandLine = parseConfigWorker(ts, sys, workspacePath, tsconfig, extraFileExtensions);
			}
			catch {
				// will be failed if web fs host first result not ready
			}
			newSysVersion = await sys.sync();
		}
		return commandLine;
	}

	function parseConfigWorker(
		ts: typeof import('typescript'),
		_host: ts.ParseConfigHost,
		workspacePath: string,
		tsconfig: string | ts.CompilerOptions,
		extraFileExtensions: ts.FileExtensionInfo[],
	) {
		let content: ts.ParsedCommandLine = {
			errors: [],
			fileNames: [],
			options: {},
		};
		const maybeUnsavedFileNames = server.documents.all()
			.map(document => URI.parse(document.uri))
			.filter(uri => uri.scheme === workspaceFolder.scheme)
			.map(uri => uriConverter.asFileName(uri));
		const host: ts.ParseConfigHost = {
			..._host,
			readDirectory(rootDir, extensions, excludes, includes, depth) {
				const fsFiles = _host.readDirectory(rootDir, extensions, excludes, includes, depth);
				const unsavedFiles = matchFiles(
					rootDir,
					extensions,
					excludes,
					includes,
					sys.useCaseSensitiveFileNames,
					getCurrentDirectory(),
					depth,
					dirPath => {
						dirPath = dirPath.replace(/\\/g, '/');
						const files: string[] = [];
						const dirs: string[] = [];
						for (const fileName of maybeUnsavedFileNames) {
							const match = sys.useCaseSensitiveFileNames
								? fileName.startsWith(dirPath + '/')
								: fileName.toLowerCase().startsWith(dirPath.toLowerCase() + '/');
							if (match) {
								const name = fileName.slice(dirPath.length + 1);
								if (name.includes('/')) {
									const dir = name.split('/')[0];
									if (!dirs.includes(dir)) {
										dirs.push(dir);
									}
								}
								else {
									files.push(name);
								}
							}
						}
						return {
							files,
							directories: dirs,
						};
					},
					path => path,
				);
				if (!unsavedFiles.length) {
					return fsFiles;
				}
				return [...new Set([...fsFiles, ...unsavedFiles])];
			},
		};
		if (typeof tsconfig === 'string') {
			const config = ts.readJsonConfigFile(tsconfig, host.readFile);
			content = ts.parseJsonSourceFileConfigFileContent(
				config,
				host,
				path.dirname(tsconfig),
				{},
				tsconfig,
				undefined,
				extraFileExtensions,
			);
		}
		else {
			content = ts.parseJsonConfigFileContent(
				{ files: [] },
				host,
				workspacePath,
				tsconfig,
				workspacePath + '/jsconfig.json',
				undefined,
				extraFileExtensions,
			);
		}
		// fix https://github.com/johnsoncodehk/volar/issues/1786
		// https://github.com/microsoft/TypeScript/issues/30457
		// patching ts server broke with outDir + rootDir + composite/incremental
		content.options.outDir = undefined;
		content.fileNames = content.fileNames.map(fileName => fileName.replace(/\\/g, '/'));
		return content;
	}
}
