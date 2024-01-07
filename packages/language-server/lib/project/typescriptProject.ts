import { LanguagePlugin, LanguageService, ServiceEnvironment, ServicePlugin, TypeScriptProjectHost, createLanguageService, resolveCommonLanguageId } from '@volar/language-service';
import { createLanguage, createSys } from '@volar/typescript';
import * as path from 'path-browserify';
import type * as ts from 'typescript';
import * as vscode from 'vscode-languageserver';
import type { ServerProject } from '../types';
import { UriMap, createUriMap } from '../utils/uriMap';
import type { ServerContext, ServerOptions } from '../server';

export interface TypeScriptServerProject extends ServerProject {
	askedFiles: UriMap<boolean>;
	tryAddFile(fileName: string): void;
	getParsedCommandLine(): ts.ParsedCommandLine;
}

export async function createTypeScriptServerProject(
	tsconfig: string | ts.CompilerOptions,
	context: ServerContext,
	serviceEnv: ServiceEnvironment,
	serverOptions: ServerOptions,
	servicePlugins: ServicePlugin[],
): Promise<TypeScriptServerProject> {

	if (!context.ts) {
		throw '!context.ts';
	}

	let parsedCommandLine: ts.ParsedCommandLine;
	let projectVersion = 0;
	let languageService: LanguageService | undefined;

	const { uriToFileName, fileNameToUri } = context.runtimeEnv;
	const ts = context.ts;
	const host: TypeScriptProjectHost = {
		fileNameToUri: context.runtimeEnv.fileNameToUri,
		uriToFileName: context.runtimeEnv.uriToFileName,
		getCurrentDirectory: () => uriToFileName(serviceEnv.workspaceFolder.toString()),
		getProjectVersion: () => projectVersion.toString(),
		getScriptFileNames: () => rootFiles,
		getScriptSnapshot: fileName => {
			askedFiles.pathSet(fileName, true);
			const doc = context.documents.get(fileNameToUri(fileName));
			if (doc) {
				return doc.getSnapshot();
			}
		},
		getCompilationSettings: () => parsedCommandLine.options,
		getLocalizedDiagnosticMessages: context.tsLocalized ? () => context.tsLocalized : undefined,
		getProjectReferences: () => parsedCommandLine.projectReferences,
		getLanguageId: uri => context.documents.get(uri)?.languageId ?? resolveCommonLanguageId(uri),
	};
	const sys = createSys(ts, serviceEnv, host);
	const languagePlugins = await serverOptions.getLanguagePlugins(serviceEnv, {
		typescript: {
			configFileName: typeof tsconfig === 'string' ? tsconfig : undefined,
			host,
			sys,
		},
	});
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
		serviceEnv,
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
			uriToFileName(serviceEnv.workspaceFolder.toString()),
			tsconfig,
			languagePlugins.map(plugin => plugin.typescript?.extraFileExtensions ?? []).flat(),
		);
		return parsedCommandLine.fileNames;
	}
	function getLanguageService() {
		if (!languageService) {
			const language = createLanguage(
				ts,
				sys,
				languagePlugins,
				typeof tsconfig === 'string' ? tsconfig : undefined,
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

		const creates = changes.filter(change => change.type === vscode.FileChangeType.Created);

		if (creates.length) {
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
