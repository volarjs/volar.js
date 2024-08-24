import { Language, LanguagePlugin, LanguageService, LanguageServiceEnvironment, ProjectContext, ProviderResult, createLanguage, createLanguageService, createUriMap } from '@volar/language-service';
import type { SnapshotDocument } from '../utils/snapshotDocument';
import { TypeScriptProjectHost, createLanguageServiceHost, createSys, resolveFileLanguageId } from '@volar/typescript';
import * as path from 'path-browserify';
import type * as ts from 'typescript';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import type { LanguageServer } from '../types';

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
	}>
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
			return rootFiles;
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
	const docOpenWatcher = server.documents.onDidOpen(({ document }) => updateFsCacheFromSyncedDocument(document));
	const docSaveWatcher = server.documents.onDidSave(({ document }) => updateFsCacheFromSyncedDocument(document));
	const docChangeWatcher = server.documents.onDidChangeContent(() => projectVersion++);
	const fileChangeWatcher = serviceEnv.onDidChangeWatchedFiles?.(params => onWorkspaceFilesChanged(params.changes));

	let rootFiles = await getRootFiles(languagePlugins);

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
		}
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
				projectHost
			),
		},
	};
	setup?.({ language, project });
	const languageService = createLanguageService(
		language,
		server.languageServicePlugins,
		serviceEnv,
		project
	);

	return {
		languageService,
		tryAddFile(fileName: string) {
			if (!rootFiles.includes(fileName)) {
				rootFiles.push(fileName);
				projectVersion++;
			}
		},
		dispose: () => {
			sys.dispose();
			languageService?.dispose();
			fileChangeWatcher?.dispose();
			docOpenWatcher.dispose();
			docSaveWatcher.dispose();
			docChangeWatcher.dispose();
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

	async function onWorkspaceFilesChanged(changes: vscode.FileEvent[]) {

		const createsAndDeletes = changes.filter(change => change.type !== vscode.FileChangeType.Changed);

		if (createsAndDeletes.length) {
			rootFiles = await getRootFiles(languagePlugins);
		}

		projectVersion++;
	}

	async function getRootFiles(languagePlugins: LanguagePlugin<URI>[]) {
		commandLine = await parseConfig(
			ts,
			sys,
			uriConverter.asFileName(workspaceFolder),
			tsconfig,
			languagePlugins.map(plugin => plugin.typescript?.extraFileExtensions ?? []).flat()
		);
		return commandLine.fileNames;
	}
}

async function parseConfig(
	ts: typeof import('typescript'),
	sys: ReturnType<typeof createSys>,
	workspacePath: string,
	tsconfig: string | ts.CompilerOptions,
	extraFileExtensions: ts.FileExtensionInfo[]
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
			commandLine = await parseConfigWorker(ts, sys, workspacePath, tsconfig, extraFileExtensions);
		} catch {
			// will be failed if web fs host first result not ready
		}
		newSysVersion = await sys.sync();
	}
	return commandLine;
}

function parseConfigWorker(
	ts: typeof import('typescript'),
	host: ts.ParseConfigHost,
	workspacePath: string,
	tsconfig: string | ts.CompilerOptions,
	extraFileExtensions: ts.FileExtensionInfo[]
) {
	let content: ts.ParsedCommandLine = {
		errors: [],
		fileNames: [],
		options: {},
	};
	if (typeof tsconfig === 'string') {
		const config = ts.readJsonConfigFile(tsconfig, host.readFile);
		content = ts.parseJsonSourceFileConfigFileContent(config, host, path.dirname(tsconfig), {}, tsconfig, undefined, extraFileExtensions);
	}
	else {
		content = ts.parseJsonConfigFileContent({ files: [] }, host, workspacePath, tsconfig, workspacePath + '/jsconfig.json', undefined, extraFileExtensions);
	}
	// fix https://github.com/johnsoncodehk/volar/issues/1786
	// https://github.com/microsoft/TypeScript/issues/30457
	// patching ts server broke with outDir + rootDir + composite/incremental
	content.options.outDir = undefined;
	content.fileNames = content.fileNames.map(fileName => fileName.replace(/\\/g, '/'));
	return content;
}
