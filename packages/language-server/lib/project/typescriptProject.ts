import { LanguagePlugin, LanguageService, ServiceEnvironment, LanguageServicePlugin, TypeScriptProjectHost, createLanguageService, resolveCommonLanguageId } from '@volar/language-service';
import { createTypeScriptLanguage, createSys } from '@volar/typescript';
import * as path from 'path-browserify';
import type * as ts from 'typescript';
import * as vscode from 'vscode-languageserver';
import type { ServerProject } from '../types';
import { UriMap, createUriMap } from '../utils/uriMap';
import type { ServerContext, ServerOptions } from '../server';
import { fileNameToUri, uriToFileName } from '../uri';

export interface TypeScriptServerProject extends ServerProject {
	askedFiles: UriMap<boolean>;
	tryAddFile(fileName: string): void;
	getParsedCommandLine(): ts.ParsedCommandLine;
}

export async function createTypeScriptServerProject(
	ts: typeof import('typescript'),
	tsLocalized: ts.MapLike<string> | undefined,
	tsconfig: string | ts.CompilerOptions,
	context: ServerContext,
	serviceEnv: ServiceEnvironment,
	servicePlugins: LanguageServicePlugin[],
	getLanguagePlugins: ServerOptions['getLanguagePlugins'],
): Promise<TypeScriptServerProject> {

	let parsedCommandLine: ts.ParsedCommandLine;
	let projectVersion = 0;
	let languageService: LanguageService | undefined;
	let customExtensions: string[] = [];

	const sys = createSys(ts, serviceEnv, uriToFileName(serviceEnv.workspaceFolder));
	const host: TypeScriptProjectHost = {
		...sys,
		configFileName: typeof tsconfig === 'string' ? tsconfig : undefined,
		getSystemVersion() {
			return sys.version;
		},
		syncSystem() {
			return sys.sync();
		},
		getCurrentDirectory() {
			return uriToFileName(serviceEnv.workspaceFolder);
		},
		getProjectVersion() {
			return projectVersion.toString();
		},
		getScriptFileNames() {
			return rootFiles;
		},
		getScriptSnapshot(fileName) {
			askedFiles.pathSet(fileName, true);
			const doc = context.documents.get(fileNameToUri(fileName));
			if (doc) {
				return doc.getSnapshot();
			}
		},
		getCompilationSettings() {
			return parsedCommandLine.options;
		},
		getLocalizedDiagnosticMessages: tsLocalized ? () => tsLocalized : undefined,
		getProjectReferences() {
			return parsedCommandLine.projectReferences;
		},
		getLanguageId(uri) {
			let languageId = context.documents.get(uri)?.languageId;
			if (!languageId) {
				languageId = resolveCommonLanguageId(uri);
				if (customExtensions.some(ext => ext === languageId)) {
					languageId = 'vue';
				}
			}
			return languageId;
		},
		fileNameToScriptId: serviceEnv.typescript!.fileNameToUri,
		scriptIdToFileName: serviceEnv.typescript!.uriToFileName,
	};
	const languagePlugins = await getLanguagePlugins(serviceEnv, {
		typescript: {
			configFileName: typeof tsconfig === 'string' ? tsconfig : undefined,
			host,
			sys,
		},
	});
	customExtensions = languagePlugins.map(plugin => plugin.typescript?.extraFileExtensions.map(ext => ext.extension) ?? []).flat();
	const askedFiles = createUriMap<boolean>(fileNameToUri);
	const docChangeWatcher = context.documents.onDidChangeContent(() => {
		projectVersion++;
	});
	const fileWatch = serviceEnv.onDidChangeWatchedFiles?.(params => {
		onWorkspaceFilesChanged(params.changes);
	});

	let rootFiles = await getRootFiles(languagePlugins);

	return {
		askedFiles,
		getLanguageService,
		getLanguageServiceDontCreate: () => languageService,
		tryAddFile(fileName: string) {
			if (!rootFiles.includes(fileName)) {
				rootFiles.push(fileName);
				projectVersion++;
			}
		},
		dispose,
		getParsedCommandLine: () => parsedCommandLine,
	};

	async function getRootFiles(languagePlugins: LanguagePlugin[]) {
		parsedCommandLine = await createParsedCommandLine(
			ts,
			sys,
			uriToFileName(serviceEnv.workspaceFolder),
			tsconfig,
			languagePlugins.map(plugin => plugin.typescript?.extraFileExtensions ?? []).flat(),
		);
		return parsedCommandLine.fileNames;
	}
	function getLanguageService() {
		if (!languageService) {
			const language = createTypeScriptLanguage(
				ts,
				languagePlugins,
				host,
			);
			languageService = createLanguageService(
				language,
				servicePlugins,
				serviceEnv,
			);
		}
		return languageService;
	}
	async function onWorkspaceFilesChanged(changes: vscode.FileEvent[]) {

		const createsAndDeletes = changes.filter(change => change.type !== vscode.FileChangeType.Changed);

		if (createsAndDeletes.length) {
			rootFiles = await getRootFiles(languagePlugins);
		}

		projectVersion++;
	}
	function dispose() {
		sys.dispose();
		languageService?.dispose();
		fileWatch?.dispose();
		docChangeWatcher.dispose();
	}
}

async function createParsedCommandLine(
	ts: typeof import('typescript'),
	sys: ReturnType<typeof createSys>,
	workspacePath: string,
	tsconfig: string | ts.CompilerOptions,
	extraFileExtensions: ts.FileExtensionInfo[],
): Promise<ts.ParsedCommandLine> {
	let content: ts.ParsedCommandLine = {
		errors: [],
		fileNames: [],
		options: {},
	};
	let sysVersion: number | undefined;
	let newSysVersion = await sys.sync();
	while (sysVersion !== newSysVersion) {
		sysVersion = newSysVersion;
		try {
			if (typeof tsconfig === 'string') {
				const config = ts.readJsonConfigFile(tsconfig, sys.readFile);
				content = ts.parseJsonSourceFileConfigFileContent(config, sys, path.dirname(tsconfig), {}, tsconfig, undefined, extraFileExtensions);
			}
			else {
				content = ts.parseJsonConfigFileContent({ files: [] }, sys, workspacePath, tsconfig, workspacePath + '/jsconfig.json', undefined, extraFileExtensions);
			}
			// fix https://github.com/johnsoncodehk/volar/issues/1786
			// https://github.com/microsoft/TypeScript/issues/30457
			// patching ts server broke with outDir + rootDir + composite/incremental
			content.options.outDir = undefined;
			content.fileNames = content.fileNames.map(fileName => fileName.replace(/\\/g, '/'));
		}
		catch {
			// will be failed if web fs host first result not ready
		}
		newSysVersion = await sys.sync();
	}
	if (content) {
		return content;
	}
	return content;
}
