import type { TypeScriptProjectHost } from '@volar/language-service';
import * as path from 'typesafe-path/posix';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { asPosix, defaultCompilerOptions } from './utils';

export function createInferredProject(
	rootPath: string,
	getScriptFileNames: () => string[],
	compilerOptions = defaultCompilerOptions
) {
	return createProjectBase(
		rootPath,
		() => ({
			options: compilerOptions,
			fileNames: getScriptFileNames().map(asPosix),
		}),
	);
}

export function createProject(
	sourceTsconfigPath: string,
	extraFileExtensions: ts.FileExtensionInfo[] = [],
	existingOptions?: ts.CompilerOptions
) {
	const ts = require('typescript') as typeof import('typescript/lib/tsserverlibrary');
	const tsconfigPath = asPosix(sourceTsconfigPath);
	return createProjectBase(
		path.dirname(tsconfigPath),
		() => {
			const parsed = ts.parseJsonSourceFileConfigFileContent(
				ts.readJsonConfigFile(tsconfigPath, ts.sys.readFile),
				ts.sys,
				path.dirname(tsconfigPath),
				existingOptions,
				tsconfigPath,
				undefined,
				extraFileExtensions,
			);
			parsed.fileNames = parsed.fileNames.map(asPosix);
			return parsed;
		},
	);
}

function createProjectBase(rootPath: string, createParsedCommandLine: () => Pick<ts.ParsedCommandLine, 'options' | 'fileNames'>) {

	const ts = require('typescript') as typeof import('typescript/lib/tsserverlibrary');
	const languageHost: TypeScriptProjectHost = {
		workspacePath: rootPath,
		rootPath: rootPath,
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
	};

	let scriptSnapshotsCache: Map<string, ts.IScriptSnapshot | undefined> = new Map();
	let parsedCommandLine = createParsedCommandLine();
	let projectVersion = 0;
	let shouldCheckRootFiles = false;

	return {
		languageHost,
		fileUpdated(fileName: string) {
			fileName = asPosix(fileName);
			if (scriptSnapshotsCache.has(fileName)) {
				projectVersion++;
				scriptSnapshotsCache.delete(fileName);
			}
		},
		fileDeleted(fileName: string) {
			fileName = asPosix(fileName);
			if (scriptSnapshotsCache.has(fileName)) {
				projectVersion++;
				scriptSnapshotsCache.delete(fileName);
				parsedCommandLine.fileNames = parsedCommandLine.fileNames.filter(name => name !== fileName);
			}
		},
		fileCreated(fileName: string) {
			fileName = asPosix(fileName);
			shouldCheckRootFiles = true;
		},
		reload() {
			scriptSnapshotsCache.clear();
			projectVersion++;
			parsedCommandLine = createParsedCommandLine();
		},
	};

	function checkRootFilesUpdate() {

		if (!shouldCheckRootFiles) return;
		shouldCheckRootFiles = false;

		const newParsedCommandLine = createParsedCommandLine();
		if (newParsedCommandLine.fileNames.length !== parsedCommandLine.fileNames.length) {
			parsedCommandLine.fileNames = newParsedCommandLine.fileNames;
			projectVersion++;
		}
	}
}
