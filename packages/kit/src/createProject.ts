import { LanguageServiceHost } from '@volar/language-service';
import * as path from 'typesafe-path/posix';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { asPosix } from './utils';

export function createProject(sourceTsconfigPath: string, extraFileExtensions: ts.FileExtensionInfo[] = []) {

	const ts = require('typescript') as typeof import('typescript/lib/tsserverlibrary');
	const tsconfigPath = asPosix(sourceTsconfigPath);
	const jsonConfig = ts.readJsonConfigFile(tsconfigPath, ts.sys.readFile);
	const host: LanguageServiceHost = {
		...ts.sys,
		fileExists,
		useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getCompilationSettings: () => parsedCommandLine.options,
		getProjectVersion: () => {
			checkRootFilesUpdate();
			return projectVersion.toString();
		},
		getScriptFileNames: () => {
			checkRootFilesUpdate();
			return parsedCommandLine.fileNames;
		},
		getProjectReferences: () => parsedCommandLine.projectReferences,
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
	let shouldCheckRootFiles = false;

	return {
		languageServiceHost: host,
		fileUpdated(fileName: string) {
			fileName = asPosix(fileName);
			if (isUsedFile(fileName)) {
				projectVersion++;
				scriptVersions[fileName] ??= 0;
				scriptVersions[fileName]++;
			}
		},
		fileDeleted(fileName: string) {
			fileName = asPosix(fileName);
			fileExistsCache[fileName] = false;
			if (isUsedFile(fileName)) {
				projectVersion++;
				delete scriptVersions[fileName];
				delete scriptSnapshots[fileName];
				parsedCommandLine.fileNames = parsedCommandLine.fileNames.filter(name => name !== fileName);
			}
		},
		fileCreated(fileName: string) {
			fileName = asPosix(fileName);
			fileExistsCache[fileName] = true;
			if (isUsedFile(fileName)) {
				projectVersion++;
			}
			shouldCheckRootFiles = true;
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

	function createParsedCommandLine() {
		const parsed = ts.parseJsonSourceFileConfigFileContent(
			jsonConfig,
			ts.sys,
			path.dirname(tsconfigPath),
			{},
			tsconfigPath,
			undefined,
			extraFileExtensions,
		);
		parsed.fileNames = parsed.fileNames.map(asPosix);
		return parsed;
	}

	function fileExists(fileName: string) {
		fileExistsCache[fileName] ??= ts.sys.fileExists(fileName);
		return fileExistsCache[fileName];
	}

	function isUsedFile(fileName: string) {
		return scriptSnapshots[fileName] !== undefined || fileExistsCache[fileName] !== undefined;
	}
}
