import { LanguageService, ServiceEnvironment, createLanguageService, resolveCommonLanguageId } from '@volar/language-service';
import { createProject, createSys, ProjectHost } from '@volar/typescript';
import * as path from 'path-browserify';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver';
import { getConfig } from '../config';
import { ServerProject, TypeScriptServerPlugin } from '../types';
import { UriMap, createUriMap } from '../utils/uriMap';
import { WorkspacesContext } from './simpleProjectProvider';

export interface TypeScriptServerProject extends ServerProject {
	askedFiles: UriMap<boolean>;
	tryAddFile(fileName: string): void;
	getParsedCommandLine(): ts.ParsedCommandLine;
}

export async function createTypeScriptServerProject(
	tsconfig: string | ts.CompilerOptions,
	context: WorkspacesContext,
	plugins: ReturnType<TypeScriptServerPlugin>[],
	serviceEnv: ServiceEnvironment,
): Promise<TypeScriptServerProject> {

	if (!context.workspaces.ts) {
		throw '!context.workspaces.ts';
	}

	const tsToken: ts.CancellationToken = {
		isCancellationRequested() {
			return token.isCancellationRequested;
		},
		throwIfCancellationRequested() { },
	};
	const { uriToFileName, fileNameToUri } = context.server.runtimeEnv;
	const ts = context.workspaces.ts;
	const projectHost: ProjectHost = {
		getCurrentDirectory: () => uriToFileName(serviceEnv.workspaceFolder.uri.toString()),
		getProjectVersion: () => projectVersion.toString(),
		getScriptFileNames: () => rootFiles,
		getScriptSnapshot: (fileName) => {
			askedFiles.pathSet(fileName, true);
			const doc = context.workspaces.documents.data.pathGet(fileName);
			if (doc) {
				return doc.getSnapshot();
			}
		},
		getCancellationToken: () => tsToken,
		getCompilationSettings: () => parsedCommandLine.options,
		getLocalizedDiagnosticMessages: context.workspaces.tsLocalized ? () => context.workspaces.tsLocalized : undefined,
		getProjectReferences: () => parsedCommandLine.projectReferences,
		getFileName: serviceEnv.uriToFileName,
		getFileId: serviceEnv.fileNameToUri,
		getLanguageId: id => context.workspaces.documents.data.pathGet(id)?.languageId ?? resolveCommonLanguageId(id),
	};
	const sys = createSys(ts, serviceEnv, projectHost.getCurrentDirectory());

	let parsedCommandLine: ts.ParsedCommandLine;
	let rootFiles = await getRootFiles();
	let projectVersion = 0;
	let token = context.server.runtimeEnv.getCancellationToken();
	let languageService: LanguageService | undefined;

	const config = await getConfig<TypeScriptServerPlugin>(context, plugins, serviceEnv, {
		parsedCommandLine: parsedCommandLine!,
		configFileName: typeof tsconfig === 'string' ? tsconfig : undefined,
	});
	const askedFiles = createUriMap<boolean>(fileNameToUri);
	const docChangeWatcher = context.workspaces.documents.onDidChangeContent(() => {
		projectVersion++;
		token = context.server.runtimeEnv.getCancellationToken();
	});
	const fileWatch = serviceEnv.onDidChangeWatchedFiles?.(params => {
		onWorkspaceFilesChanged(params.changes);
	});

	return {
		askedFiles,
		serviceEnv,
		getLanguageService,
		getLanguageServiceDontCreate: () => languageService,
		tryAddFile(fileName: string) {
			if (!rootFiles.includes(fileName)) {
				rootFiles.push(fileName);
				projectVersion++;
				token = context.server.runtimeEnv.getCancellationToken();
			}
		},
		dispose,
		getParsedCommandLine: () => parsedCommandLine,
	};

	async function getRootFiles() {
		parsedCommandLine = await createParsedCommandLine(
			ts,
			sys,
			uriToFileName(serviceEnv.workspaceFolder.uri.toString()),
			tsconfig,
			plugins,
		);
		return parsedCommandLine.fileNames;
	}
	function getLanguageService() {
		if (!languageService) {
			const project = createProject(
				ts,
				sys,
				Object.values(config.languages ?? {}),
				typeof tsconfig === 'string' ? tsconfig : undefined,
				projectHost,
			);
			languageService = createLanguageService(
				{ typescript: context.workspaces.ts },
				Object.values(config.services ?? {}),
				serviceEnv,
				project,
			);
		}
		return languageService;
	}
	async function onWorkspaceFilesChanged(changes: vscode.FileEvent[]) {

		const creates = changes.filter(change => change.type === vscode.FileChangeType.Created);

		if (creates.length) {
			rootFiles = await getRootFiles();
		}

		projectVersion++;
		token = context.server.runtimeEnv.getCancellationToken();
	}
	function dispose() {
		sys.dispose();
		languageService?.dispose();
		fileWatch?.dispose();
		docChangeWatcher.dispose();
	}
}

async function createParsedCommandLine(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	sys: ReturnType<typeof createSys>,
	workspacePath: string,
	tsconfig: string | ts.CompilerOptions,
	plugins: ReturnType<TypeScriptServerPlugin>[],
): Promise<ts.ParsedCommandLine> {
	const extraFileExtensions = plugins.map(plugin => plugin.extraFileExtensions ?? []).flat();
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
