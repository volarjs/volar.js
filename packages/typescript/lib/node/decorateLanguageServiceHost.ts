import type { FileRegistry } from '@volar/language-core';
import { resolveCommonLanguageId } from '@volar/language-service';
import type * as ts from 'typescript';

export function decorateLanguageServiceHost(
	virtualFiles: FileRegistry,
	languageServiceHost: ts.LanguageServiceHost,
	ts: typeof import('typescript'),
) {

	let extraProjectVersion = 0;

	const exts = virtualFiles.languagePlugins
		.map(plugin => plugin.typescript?.extraFileExtensions.map(ext => '.' + ext.extension) ?? [])
		.flat();
	const scripts = new Map<string, {
		version: string;
		snapshot: ts.IScriptSnapshot | undefined;
		kind: ts.ScriptKind;
		extension: string;
	}>();

	const readDirectory = languageServiceHost.readDirectory?.bind(languageServiceHost);
	const resolveModuleNameLiterals = languageServiceHost.resolveModuleNameLiterals?.bind(languageServiceHost);
	const resolveModuleNames = languageServiceHost.resolveModuleNames?.bind(languageServiceHost);
	const getProjectVersion = languageServiceHost.getProjectVersion?.bind(languageServiceHost);
	const getScriptSnapshot = languageServiceHost.getScriptSnapshot.bind(languageServiceHost);
	const getScriptKind = languageServiceHost.getScriptKind?.bind(languageServiceHost);

	// path completion
	if (readDirectory) {
		languageServiceHost.readDirectory = (path, extensions, exclude, include, depth) => {
			if (extensions) {
				for (const ext of exts) {
					if (!extensions.includes(ext)) {
						extensions = [...extensions, ...ext];
					}
				}
			}
			return readDirectory(path, extensions, exclude, include, depth);
		};
	}

	if (resolveModuleNameLiterals) {
		languageServiceHost.resolveModuleNameLiterals = (
			moduleNames,
			containingFile,
			redirectedReference,
			options,
			...rest
		) => {
			const resolvedModules = resolveModuleNameLiterals(
				moduleNames,
				containingFile,
				redirectedReference,
				options,
				...rest,
			);
			return moduleNames.map<ts.ResolvedModuleWithFailedLookupLocations>((name, i) => {
				if (exts.some(ext => name.text.endsWith(ext))) {
					const resolved = resolveModuleName(name.text, containingFile, options, redirectedReference);
					if (resolved.resolvedModule) {
						return resolved;
					}
				}
				return resolvedModules[i];
			});
		};
	}
	else if (resolveModuleNames) {
		languageServiceHost.resolveModuleNames = (
			moduleNames,
			containingFile,
			reusedNames,
			redirectedReference,
			options,
			containingSourceFile
		) => {
			const resolvedModules = resolveModuleNames(
				moduleNames,
				containingFile,
				reusedNames,
				redirectedReference,
				options,
				containingSourceFile,
			);
			return moduleNames.map<ts.ResolvedModule | undefined>((name, i) => {
				if (exts.some(ext => name.endsWith(ext))) {
					const resolved = resolveModuleName(name, containingFile, options, redirectedReference);
					if (resolved.resolvedModule) {
						return resolved.resolvedModule;
					}
				}
				return resolvedModules[i];
			});
		};
	}

	if (getProjectVersion) {
		languageServiceHost.getProjectVersion = () => {
			return getProjectVersion() + ':' + extraProjectVersion;
		};
	}

	languageServiceHost.getScriptSnapshot = fileName => {
		if (exts.some(ext => fileName.endsWith(ext))) {
			updateScript(fileName);
			return scripts.get(fileName)?.snapshot;
		}
		return getScriptSnapshot(fileName);
	};

	if (getScriptKind) {
		languageServiceHost.getScriptKind = fileName => {
			if (exts.some(ext => fileName.endsWith(ext))) {
				updateScript(fileName);
				const script = scripts.get(fileName);
				if (script) {
					return script.kind;
				}
				return ts.ScriptKind.Deferred;
			}
			return getScriptKind(fileName);
		};
	}

	function resolveModuleName(name: string, containingFile: string, options: ts.CompilerOptions, redirectedReference?: ts.ResolvedProjectReference) {
		const resolved = ts.resolveModuleName(name, containingFile, options, {
			readFile(fileName) {
				return languageServiceHost.readFile(fileName);
			},
			fileExists(fileName) {
				if (exts.some(ext => fileName.endsWith(ext + '.d.ts'))) {
					return fileExists(fileName.slice(0, -'.d.ts'.length));
				}
				return languageServiceHost.fileExists(fileName);
			},
		}, undefined, redirectedReference);
		if (resolved.resolvedModule) {
			resolved.resolvedModule.resolvedFileName = resolved.resolvedModule.resolvedFileName.slice(0, -'.d.ts'.length);
			const script = updateScript(resolved.resolvedModule.resolvedFileName);
			if (script) {
				resolved.resolvedModule.extension = script.extension;
			}
		}
		return resolved;
	}

	// fix https://github.com/vuejs/language-tools/issues/3332
	function fileExists(fileName: string) {
		if (languageServiceHost.fileExists(fileName)) {
			const fileSize = ts.sys.getFileSize?.(fileName) ?? languageServiceHost.readFile(fileName)?.length ?? 0;
			return fileSize < 4 * 1024 * 1024;
		}
		return false;
	}

	function updateScript(fileName: string) {

		const version = languageServiceHost.getScriptVersion(fileName);

		if (version !== scripts.get(fileName)?.version) {

			let extension = '.ts';
			let snapshotSnapshot: ts.IScriptSnapshot | undefined;
			let scriptKind = ts.ScriptKind.TS;

			const snapshot = getScriptSnapshot(fileName);

			if (snapshot) {
				extraProjectVersion++;
				const sourceFile = virtualFiles.set(fileName, resolveCommonLanguageId(fileName), snapshot);
				if (sourceFile.generated) {
					const text = snapshot.getText(0, snapshot.getLength());
					let patchedText = text.split('\n').map(line => ' '.repeat(line.length)).join('\n');
					const tsCode = sourceFile.generated.languagePlugin.typescript?.getLanguageServiceCode(sourceFile.generated.code);
					if (tsCode) {
						extension = tsCode.extension;
						scriptKind = tsCode.scriptKind;
						patchedText += tsCode.code.snapshot.getText(0, tsCode.code.snapshot.getLength());
					}
					snapshotSnapshot = ts.ScriptSnapshot.fromString(patchedText);
				}
			}
			else if (virtualFiles.get(fileName)) {
				extraProjectVersion++;
				virtualFiles.delete(fileName);
			}

			scripts.set(fileName, {
				version,
				extension,
				snapshot: snapshotSnapshot,
				kind: scriptKind,
			});
		}

		return scripts.get(fileName);
	}
}

export function searchExternalFiles(ts: typeof import('typescript'), project: ts.server.Project, exts: string[]) {
	if (project.projectKind !== ts.server.ProjectKind.Configured) {
		return [];
	}
	const configFile = project.getProjectName();
	const config = ts.readJsonConfigFile(configFile, project.readFile.bind(project));
	const parseHost: ts.ParseConfigHost = {
		useCaseSensitiveFileNames: project.useCaseSensitiveFileNames(),
		fileExists: project.fileExists.bind(project),
		readFile: project.readFile.bind(project),
		readDirectory: (...args) => {
			args[1] = exts;
			return project.readDirectory(...args);
		},
	};
	const parsed = ts.parseJsonSourceFileConfigFileContent(config, parseHost, project.getCurrentDirectory());
	return parsed.fileNames;
}
