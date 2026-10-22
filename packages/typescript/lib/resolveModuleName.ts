import type { LanguagePlugin, SourceScript } from '@volar/language-core';
import type * as ts from 'typescript';

export function createResolveModuleName<T>(
	ts: typeof import('typescript'),
	getFileSize: ((fileName: string) => number) | undefined,
	host: ts.ModuleResolutionHost,
	languagePlugins: LanguagePlugin<any>[],
	getSourceScript: (fileName: string) => SourceScript<T> | undefined,
) {
	const toSourceFileInfo = new Map<string, {
		sourceFileName: string;
		extension: string;
	}>();
	const moduleResolutionHost: ts.ModuleResolutionHost = {
		readFile: host.readFile.bind(host),
		directoryExists: host.directoryExists?.bind(host),
		realpath: host.realpath?.bind(host),
		getCurrentDirectory: host.getCurrentDirectory?.bind(host),
		getDirectories: host.getDirectories?.bind(host),
		useCaseSensitiveFileNames: typeof host.useCaseSensitiveFileNames === 'function'
			? host.useCaseSensitiveFileNames.bind(host)
			: host.useCaseSensitiveFileNames,
		fileExists(fileName) {
			const result = host.fileExists(fileName);
			for (const { typescript } of languagePlugins) {
				if (!typescript) {
					continue;
				}
				if (!result) {
					for (const { extension } of typescript.extraFileExtensions) {
						if (!fileName.endsWith(`.d.${extension}.ts`)) {
							continue;
						}
						const sourceFileName = fileName.slice(0, -`.d.${extension}.ts`.length) + `.${extension}`;
						if (fileExists(sourceFileName)) {
							const sourceScript = getSourceScript(sourceFileName);
							if (sourceScript?.generated) {
								const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(
									sourceScript.generated.root,
								);
								if (serviceScript) {
									const dtsPath = sourceFileName + '.d.ts';
									if (
										(serviceScript.extension === '.js' || serviceScript.extension === '.jsx') && fileExists(dtsPath)
									) {
										toSourceFileInfo.set(fileName, {
											sourceFileName: dtsPath,
											extension: '.ts',
										});
									}
									else {
										toSourceFileInfo.set(fileName, {
											sourceFileName,
											extension: serviceScript.extension,
										});
									}
									return true;
								}
							}
						}
					}
				}
				if (typescript.resolveHiddenExtensions && fileName.endsWith(`.d.ts`)) {
					for (const { extension } of typescript.extraFileExtensions) {
						const sourceFileName = fileName.slice(0, -`.d.ts`.length) + `.${extension}`;
						if (fileExists(sourceFileName)) {
							const sourceScript = getSourceScript(sourceFileName);
							if (sourceScript?.generated) {
								const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(
									sourceScript.generated.root,
								);
								if (serviceScript) {
									toSourceFileInfo.set(fileName, {
										sourceFileName,
										extension: serviceScript.extension,
									});
									return true;
								}
							}
						}
					}
				}
			}
			return result;
		},
	};
	return (
		moduleName: string,
		containingFile: string,
		compilerOptions: ts.CompilerOptions,
		cache?: ts.ModuleResolutionCache,
		redirectedReference?: ts.ResolvedProjectReference,
		resolutionMode?: ts.ResolutionMode,
	) => {
		const result = ts.resolveModuleName(
			moduleName,
			containingFile,
			compilerOptions,
			moduleResolutionHost,
			cache,
			redirectedReference,
			resolutionMode,
		);
		const resolvedModule: (ts.ResolvedModuleFull & { originalPath?: string }) | undefined = result.resolvedModule;
		if (resolvedModule) {
			const sourceFileInfo = toSourceFileInfo.get(resolvedModule.resolvedFileName);
			if (sourceFileInfo) {
				resolvedModule.resolvedFileName = sourceFileInfo.sourceFileName;
				resolvedModule.extension = sourceFileInfo.extension;
				// TypeScript could not realpath the virtual file name, so do it for the source file
				// under the same conditions TypeScript applies to node_modules lookups.
				if (
					!compilerOptions.preserveSymlinks
					&& host.realpath
					&& resolvedModule.isExternalLibraryImport
					&& !resolvedModule.originalPath
					&& !ts.isExternalModuleNameRelative(moduleName)
				) {
					const realPath = host.realpath(sourceFileInfo.sourceFileName).replace(/\\/g, '/');
					if (!isSamePath(realPath, sourceFileInfo.sourceFileName)) {
						resolvedModule.originalPath = sourceFileInfo.sourceFileName;
						resolvedModule.resolvedFileName = realPath;
					}
				}
			}
		}
		toSourceFileInfo.clear();
		return result;
	};

	function isSamePath(a: string, b: string) {
		const useCaseSensitiveFileNames = typeof host.useCaseSensitiveFileNames === 'function'
			? host.useCaseSensitiveFileNames()
			: host.useCaseSensitiveFileNames;
		return useCaseSensitiveFileNames ? a === b : a.toLowerCase() === b.toLowerCase();
	}

	// fix https://github.com/vuejs/language-tools/issues/3332
	function fileExists(fileName: string) {
		if (host.fileExists(fileName)) {
			const fileSize = getFileSize?.(fileName) ?? host.readFile(fileName)?.length ?? 0;
			return fileSize < 4 * 1024 * 1024;
		}
		return false;
	}
}
