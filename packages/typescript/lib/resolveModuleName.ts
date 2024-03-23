import type { LanguagePlugin, SourceScript } from '@volar/language-core';
import type * as ts from 'typescript';

export function createResolveModuleName(
	ts: typeof import('typescript'),
	languageServiceHost: ts.LanguageServiceHost,
	languagePlugins: LanguagePlugin<any>[],
	getSourceScript: (fileName: string) => SourceScript | undefined,
) {
	const toPatchResults = new Map<string, string>();
	const moduleResolutionHost: ts.ModuleResolutionHost = {
		readFile: languageServiceHost.readFile.bind(languageServiceHost),
		directoryExists: languageServiceHost.directoryExists?.bind(languageServiceHost),
		realpath: languageServiceHost.realpath?.bind(languageServiceHost),
		getCurrentDirectory: languageServiceHost.getCurrentDirectory.bind(languageServiceHost),
		getDirectories: languageServiceHost.getDirectories?.bind(languageServiceHost),
		useCaseSensitiveFileNames: languageServiceHost.useCaseSensitiveFileNames?.bind(languageServiceHost),
		fileExists(fileName) {
			for (const { typescript } of languagePlugins) {
				if (!typescript) {
					continue;
				}
				for (const { extension } of typescript.extraFileExtensions) {
					if (fileName.endsWith(`.d.${extension}.ts`)) {
						const patchFileName = fileName.slice(0, -`.d.${extension}.ts`.length) + `.${extension}`;
						if (fileExists(patchFileName)) {
							toPatchResults.set(fileName, patchFileName);
							return true;
						}
					}
				}
			}
			return languageServiceHost.fileExists(fileName);
		},
	};
	return (
		moduleName: string,
		containingFile: string,
		compilerOptions: ts.CompilerOptions,
		cache?: ts.ModuleResolutionCache,
		redirectedReference?: ts.ResolvedProjectReference,
		resolutionMode?: ts.ResolutionMode
	) => {
		const result = ts.resolveModuleName(
			moduleName,
			containingFile,
			compilerOptions,
			moduleResolutionHost,
			cache,
			redirectedReference,
			resolutionMode
		);
		if (result.resolvedModule && toPatchResults.has(result.resolvedModule.resolvedFileName)) {
			result.resolvedModule.resolvedFileName = toPatchResults.get(result.resolvedModule.resolvedFileName)!;
			const sourceScript = getSourceScript(result.resolvedModule.resolvedFileName);
			if (sourceScript?.generated) {
				const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
				if (serviceScript) {
					result.resolvedModule.extension = serviceScript.extension;
				}
			}
		}
		toPatchResults.clear();
		return result;
	};

	// fix https://github.com/vuejs/language-tools/issues/3332
	function fileExists(fileName: string) {
		if (languageServiceHost.fileExists(fileName)) {
			const fileSize = ts.sys.getFileSize?.(fileName) ?? languageServiceHost.readFile(fileName)?.length ?? 0;
			return fileSize < 4 * 1024 * 1024;
		}
		return false;
	}
}
