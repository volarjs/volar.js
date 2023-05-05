import { LanguageServiceHost } from '@volar/language-service';
import * as path from 'typesafe-path/posix';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { asPosix } from './utils';

export function createInferredProject(
	rootPath: string,
	getScriptFileNames: () => string[],
	compilerOptions: ts.CompilerOptions = {
		allowJs: true,
		allowSyntheticDefaultImports: true,
		allowNonTsExtensions: true,
		resolveJsonModule: true,
		jsx: 1 /* ts.JsxEmit.Preserve */,
	}
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
	extraFileExtensions: ts.FileExtensionInfo[] = []
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
				{},
				tsconfigPath,
				undefined,
				extraFileExtensions,
			);
			parsed.fileNames = parsed.fileNames.map(asPosix);
			return parsed;
		},
	);
}

function createProjectBase(
	rootPath: string,
	createParsedCommandLine: () => Pick<ts.ParsedCommandLine, 'options' | 'fileNames'>
) {

	const ts = require('typescript') as typeof import('typescript/lib/tsserverlibrary');
	const host: LanguageServiceHost = {
		...ts.sys,
		getCurrentDirectory: () => rootPath,
		fileExists,
		useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getCompilationSettings: () => parsedCommandLine.options,
		getProjectVersion: () => {
			checkRootFilesUpdate();
			return projectVersion.toString();
		},
		getTypeRootsVersion: () => {
			return typeRootsVersion;
		},
		getScriptFileNames: () => {
			checkRootFilesUpdate();
			return parsedCommandLine.fileNames;
		},
		getScriptVersion: (fileName) => scriptVersions[fileName]?.toString() ?? '',
		getScriptSnapshot: (fileName) => {
			const version = host.getScriptVersion(fileName);
			if (!scriptSnapshots[fileName] || scriptSnapshots[fileName][0] !== version) {
				const fileText = ts.sys.readFile(fileName);
				scriptSnapshots[fileName] = [version, fileText ? ts.ScriptSnapshot.fromString(fileText) : undefined];
			}
			return scriptSnapshots[fileName][1];
		},
	};

	let fileExistsCache: Record<string, boolean> = {};
	let scriptVersions: Record<string, number> = {};
	let scriptSnapshots: Record<string, [string, ts.IScriptSnapshot | undefined]> = {};
	let parsedCommandLine = createParsedCommandLine();
	let projectVersion = 0;
	let typeRootsVersion = 0;
	let shouldCheckRootFiles = false;

	return {
		languageServiceHost: host,
		isKnownRelatedFile,
		fileUpdated(fileName: string) {
			fileName = asPosix(fileName);
			if (isKnownRelatedFile(fileName)) {
				projectVersion++;
				scriptVersions[fileName] ??= 0;
				scriptVersions[fileName]++;
			}
		},
		fileDeleted(fileName: string) {
			fileName = asPosix(fileName);
			fileExistsCache[fileName] = false;
			if (isKnownRelatedFile(fileName)) {
				projectVersion++;
				delete scriptVersions[fileName];
				delete scriptSnapshots[fileName];
				parsedCommandLine.fileNames = parsedCommandLine.fileNames.filter(name => name !== fileName);
			}
		},
		fileCreated(fileName: string) {
			fileName = asPosix(fileName);
			if (isKnownRelatedFile(fileName)) {
				projectVersion++;
				typeRootsVersion++;
			}
			shouldCheckRootFiles = true;
			fileExistsCache[fileName] = true;
			scriptVersions[fileName] ??= 0;
			scriptVersions[fileName]++;
		},
		reload() {
			fileExistsCache = {};
			scriptVersions = {};
			scriptSnapshots = {};
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

	function fileExists(fileName: string) {
		fileExistsCache[fileName] ??= ts.sys.fileExists(fileName);
		return fileExistsCache[fileName];
	}

	function isKnownRelatedFile(fileName: string) {
		return scriptSnapshots[fileName] !== undefined || fileExistsCache[fileName] !== undefined;
	}
}
