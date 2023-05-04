import { LanguageServiceHost } from '@volar/language-service';
import * as path from 'path';
import type * as ts from 'typescript/lib/tsserverlibrary';

export function createLanguageServiceHost(tsConfigPath: string, extraFileExtensions: ts.FileExtensionInfo[] = []) {

	let projectVersion = 0;

	const ts = require('typescript') as any;
	const scriptVersions = new Map<string, number>();
	const scriptSnapshots = new Map<string, ts.IScriptSnapshot>();
	const jsonConfig = ts.readJsonConfigFile(tsConfigPath, ts.sys.readFile);
	const parsedCommandLine = ts.parseJsonSourceFileConfigFileContent(jsonConfig, ts.sys, path.dirname(tsConfigPath), {}, tsConfigPath, undefined, extraFileExtensions);
	const host: LanguageServiceHost = {
		...ts.sys,
		getProjectVersion: () => projectVersion.toString(),
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
		getCompilationSettings: () => parsedCommandLine.options,
		getScriptFileNames: () => parsedCommandLine.fileNames,
		getProjectReferences: () => parsedCommandLine.projectReferences,
		getScriptVersion: (fileName) => scriptVersions.get(fileName)?.toString() ?? '',
		getScriptSnapshot: (fileName) => {
			if (!scriptSnapshots.has(fileName)) {
				const fileText = ts.sys.readFile(fileName);
				if (fileText !== undefined) {
					scriptSnapshots.set(fileName, ts.ScriptSnapshot.fromString(fileText));
				}
			}
			return scriptSnapshots.get(fileName);
		},
	};

	return host;
}
