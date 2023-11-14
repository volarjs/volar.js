import { Config, FileChangeType, Project, ServiceEnvironment, TypeScriptProjectHost, createTypeScriptProject as _createTypeScriptProject, createFileProvider } from '@volar/language-service';
import * as path from 'typesafe-path/posix';
import * as ts from 'typescript';
import * as fs from 'fs';
import { asPosix, defaultCompilerOptions } from './utils';

export default function createKitProject(config: Config): Project {

	const fileMtimes = new Map<string, number>();
	const fileProvider = createFileProvider(
		Object.values(config.languages ?? {}),
		fileName => {
			if (fs.existsSync(fileName)) {
				const stat = fs.statSync(fileName);
				if (stat.mtimeMs !== fileMtimes.get(fileName)) {
					fileMtimes.set(fileName, stat.mtimeMs);
					const text = fs.readFileSync(fileName, 'utf8');
					fileProvider.updateSource(fileName, ts.ScriptSnapshot.fromString(text), undefined);
				}
			}
			else if (fileMtimes.has(fileName)) {
				fileMtimes.delete(fileName);
				fileProvider.deleteSource(fileName);
			}
		}
	);

	return { fileProvider };
}

export function createTypeScriptInferredKitProject(
	env: ServiceEnvironment,
	config: Config,
	rootPath: string,
	getScriptFileNames: () => string[],
	compilerOptions = defaultCompilerOptions
): Project {

	const projectHost = createTypeScriptProjectHost(
		env,
		undefined,
		rootPath,
		() => ({
			options: compilerOptions,
			fileNames: getScriptFileNames().map(asPosix),
		}),
	);

	return _createTypeScriptProject(projectHost, Object.values(config.languages ?? {}));
}

export function createTypeScriptKitProject(
	env: ServiceEnvironment,
	config: Config,
	sourceTsconfigPath: string,
	extraFileExtensions: ts.FileExtensionInfo[] = [],
	existingOptions?: ts.CompilerOptions
): Project {

	const tsconfigPath = asPosix(sourceTsconfigPath);
	const projectHost = createTypeScriptProjectHost(
		env,
		tsconfigPath,
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

	return _createTypeScriptProject(projectHost, Object.values(config.languages ?? {}));
}

function createTypeScriptProjectHost(
	env: ServiceEnvironment,
	tsconfig: string | undefined,
	rootPath: string,
	createParsedCommandLine: () => Pick<ts.ParsedCommandLine, 'options' | 'fileNames'>
) {

	let scriptSnapshotsCache: Map<string, ts.IScriptSnapshot | undefined> = new Map();
	let parsedCommandLine = createParsedCommandLine();
	let projectVersion = 0;
	let shouldCheckRootFiles = false;

	const host: TypeScriptProjectHost = {
		configFileName: tsconfig,
		getCurrentDirectory: () => {
			return rootPath;
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
