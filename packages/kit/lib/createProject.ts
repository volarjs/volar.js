import { FileChangeType, Language, Project, ServiceEnvironment, TypeScriptProjectHost, createTypeScriptProject as _createTypeScriptProject, resolveCommonLanguageId } from '@volar/language-service';
import * as path from 'typesafe-path/posix';
import * as ts from 'typescript';
import { asPosix, defaultCompilerOptions } from './utils';

export function createTypeScriptInferredKitProject(
	languages: Language[],
	env: ServiceEnvironment,
	getScriptFileNames: () => string[],
	compilerOptions = defaultCompilerOptions
): Project {

	const projectHost = createTypeScriptProjectHost(
		env,
		undefined,
		() => ({
			options: compilerOptions,
			fileNames: getScriptFileNames().map(asPosix),
		}),
	);

	return _createTypeScriptProject(projectHost, languages, resolveCommonLanguageId);
}

export function createTypeScriptKitProject(
	languages: Language[],
	env: ServiceEnvironment,
	sourceTsconfigPath: string,
	extraFileExtensions: ts.FileExtensionInfo[] = [],
): Project {

	const tsconfigPath = asPosix(sourceTsconfigPath);
	const projectHost = createTypeScriptProjectHost(
		env,
		tsconfigPath,
		() => {
			const parsed = ts.parseJsonSourceFileConfigFileContent(
				ts.readJsonConfigFile(tsconfigPath, ts.sys.readFile),
				ts.sys,
				path.dirname(tsconfigPath),
				undefined,
				tsconfigPath,
				undefined,
				extraFileExtensions,
			);
			parsed.fileNames = parsed.fileNames.map(asPosix);
			return parsed;
		},
	);

	return _createTypeScriptProject(projectHost, languages, resolveCommonLanguageId);
}

export function createTypeScriptProjectHost(
	env: ServiceEnvironment,
	tsconfig: string | undefined,
	createParsedCommandLine: () => Pick<ts.ParsedCommandLine, 'options' | 'fileNames'>
) {

	let scriptSnapshotsCache: Map<string, ts.IScriptSnapshot | undefined> = new Map();
	let parsedCommandLine = createParsedCommandLine();
	let projectVersion = 0;
	let shouldCheckRootFiles = false;

	const host: TypeScriptProjectHost = {
		configFileName: tsconfig,
		getCurrentDirectory: () => {
			return env.uriToFileName(env.workspaceFolder.uri.toString());
		},
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

	env.onDidChangeWatchedFiles?.(({ changes }) => {
		for (const change of changes) {
			const fileName = env.uriToFileName(change.uri);
			if (change.type === 2 satisfies typeof FileChangeType.Changed) {
				if (scriptSnapshotsCache.has(fileName)) {
					projectVersion++;
					scriptSnapshotsCache.delete(fileName);
				}
			}
			else if (change.type === 3 satisfies typeof FileChangeType.Deleted) {
				if (scriptSnapshotsCache.has(fileName)) {
					projectVersion++;
					scriptSnapshotsCache.delete(fileName);
					parsedCommandLine.fileNames = parsedCommandLine.fileNames.filter(name => name !== fileName);
				}
			}
			else if (change.type === 1 satisfies typeof FileChangeType.Created) {
				shouldCheckRootFiles = true;
			}
		}
	});

	return host;

	function checkRootFilesUpdate() {

		if (!shouldCheckRootFiles) return;
		shouldCheckRootFiles = false;

		const newParsedCommandLine = createParsedCommandLine();
		if (!arrayItemsEqual(newParsedCommandLine.fileNames, parsedCommandLine.fileNames)) {
			parsedCommandLine.fileNames = newParsedCommandLine.fileNames;
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
