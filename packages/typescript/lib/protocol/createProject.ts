import { createFileProvider, Language, Project } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { createLanguageServiceHost } from './createLanguageServiceHost';

const scriptVersions = new Map<string, { lastVersion: number; map: WeakMap<ts.IScriptSnapshot, number>; }>();
const fsFileSnapshots = new Map<string, [number | undefined, ts.IScriptSnapshot | undefined]>();

export interface ProjectHost extends Pick<
	ts.LanguageServiceHost,
	'getLocalizedDiagnosticMessages'
	| 'getCompilationSettings'
	| 'getProjectReferences'
	| 'getCurrentDirectory'
	| 'getScriptFileNames'
	| 'getProjectVersion'
	| 'getScriptSnapshot'
	| 'getCancellationToken'
> { }

export function createProject(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	sys: ts.System & {
		version?: number;
	},
	languages: Language<any>[],
	configFileName: string | undefined,
	projectHost: ProjectHost,
	{ fileNameToId, idToFileName, getLanguageId }: {
		fileNameToId(fileName: string): string;
		idToFileName(id: string): string;
		getLanguageId(id: string): string;
	},
): Project {

	const fileProvider = createFileProvider(languages, (id) => {

		const fileName = idToFileName(id);

		// opened files
		let snapshot = projectHost.getScriptSnapshot(fileName);

		if (!snapshot) {
			// fs files
			const cache = fsFileSnapshots.get(fileName);
			const modifiedTime = sys.getModifiedTime?.(fileName)?.valueOf();
			if (!cache || cache[0] !== modifiedTime) {
				if (sys.fileExists(fileName)) {
					const text = sys.readFile(fileName);
					const snapshot = text !== undefined ? ts.ScriptSnapshot.fromString(text) : undefined;
					fsFileSnapshots.set(fileName, [modifiedTime, snapshot]);
				}
				else {
					fsFileSnapshots.set(fileName, [modifiedTime, undefined]);
				}
			}
			snapshot = fsFileSnapshots.get(fileName)?.[1];
		}

		if (snapshot) {
			fileProvider.updateSourceFile(id, snapshot, getLanguageId(id));
		}
		else {
			fileProvider.deleteSourceFile(id);
		}
	});

	let languageServiceHost = createLanguageServiceHost(
		ts,
		sys,
		projectHost,
		fileProvider,
		{
			fileNameToId,
			idToFileName,
			getScriptVersion,
		},
	);

	for (const language of languages) {
		if (language.typescript?.resolveLanguageServiceHost) {
			languageServiceHost = language.typescript.resolveLanguageServiceHost(languageServiceHost);
		}
	}

	if (languages.some(language => language.typescript?.resolveModuleName)) {

		// TODO: can this share between monorepo packages?
		const moduleCache = ts.createModuleResolutionCache(
			languageServiceHost.getCurrentDirectory(),
			languageServiceHost.useCaseSensitiveFileNames ? s => s : s => s.toLowerCase(),
			languageServiceHost.getCompilationSettings()
		);

		let lastSysVersion = sys.version;

		languageServiceHost.resolveModuleNameLiterals = (
			moduleLiterals,
			containingFile,
			redirectedReference,
			options,
			sourceFile
		) => {
			if (lastSysVersion !== sys.version) {
				lastSysVersion = sys.version;
				moduleCache.clear();
			}
			return moduleLiterals.map((moduleLiteral) => {
				let moduleName = moduleLiteral.text;
				for (const language of languages) {
					if (language.typescript?.resolveModuleName) {
						moduleName = language.typescript.resolveModuleName(moduleName, sourceFile.impliedNodeFormat) ?? moduleName;
					}
				}
				return ts.resolveModuleName(
					moduleName,
					containingFile,
					options,
					languageServiceHost,
					moduleCache,
					redirectedReference,
					sourceFile.impliedNodeFormat
				);
			});
		};
		languageServiceHost.resolveModuleNames = (
			moduleNames,
			containingFile,
			_reusedNames,
			redirectedReference,
			options,
			sourceFile
		) => {
			if (lastSysVersion !== sys.version) {
				lastSysVersion = sys.version;
				moduleCache.clear();
			}
			return moduleNames.map((moduleName) => {
				for (const language of languages) {
					if (language.typescript?.resolveModuleName) {
						moduleName = language.typescript.resolveModuleName!(moduleName, sourceFile?.impliedNodeFormat) ?? moduleName;
					}
				}
				return ts.resolveModuleName(
					moduleName,
					containingFile,
					options,
					languageServiceHost,
					moduleCache,
					redirectedReference,
					sourceFile?.impliedNodeFormat
				).resolvedModule;
			});
		};
	}

	return {
		fileProvider,
		typescript: {
			configFileName,
			sys,
			languageServiceHost,
		},
	};

	function getScriptVersion(fileName: string): string {

		if (!scriptVersions.has(fileName)) {
			scriptVersions.set(fileName, { lastVersion: 0, map: new WeakMap() });
		}

		const version = scriptVersions.get(fileName)!;
		const virtualFile = fileProvider.getVirtualFile(fileNameToId(fileName))[0];
		if (virtualFile) {
			if (!version.map.has(virtualFile.snapshot)) {
				version.map.set(virtualFile.snapshot, version.lastVersion++);
			}
			return version.map.get(virtualFile.snapshot)!.toString();
		}

		const isOpenedFile = !!projectHost.getScriptSnapshot(fileName);
		if (isOpenedFile) {
			const sourceFile = fileProvider.getSourceFile(fileNameToId(fileName));
			if (sourceFile && !sourceFile.root) {
				if (!version.map.has(sourceFile.snapshot)) {
					version.map.set(sourceFile.snapshot, version.lastVersion++);
				}
				return version.map.get(sourceFile.snapshot)!.toString();
			}
		}

		if (sys.fileExists(fileName)) {
			return sys.getModifiedTime?.(fileName)?.valueOf().toString() ?? '0';
		}

		return '';
	}
}
