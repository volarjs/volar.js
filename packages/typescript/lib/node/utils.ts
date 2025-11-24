import type { Language, SourceScript } from '@volar/language-core';
import type * as ts from 'typescript';
import type { TypeScriptServiceScript } from '../..';

export function getServiceScript(language: Language<string>, fileName: string):
	| [serviceScript: TypeScriptServiceScript, targetScript: SourceScript<string>, sourceScript: SourceScript<string>]
	| [serviceScript: undefined, sourceScript: SourceScript<string>, sourceScript: SourceScript<string>]
	| [serviceScript: undefined, sourceScript: undefined, targetScript: undefined]
{
	const sourceScript = language.scripts.get(fileName);
	if (sourceScript?.targetIds.size) {
		for (const targetId of sourceScript.targetIds) {
			const targetScript = language.scripts.get(targetId);
			if (targetScript?.generated) {
				const serviceScript = targetScript.generated.languagePlugin.typescript?.getServiceScript(
					targetScript.generated.root,
				);
				if (serviceScript) {
					return [serviceScript, targetScript, sourceScript];
				}
			}
		}
	}
	if (sourceScript?.associatedOnly) {
		return [undefined, sourceScript, sourceScript];
	}
	if (sourceScript?.generated) {
		const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(
			sourceScript.generated.root,
		);
		if (serviceScript) {
			return [serviceScript, sourceScript, sourceScript];
		}
	}
	return [undefined, undefined, undefined];
}

export function createGetModeForUsageLocation(ts: typeof import('typescript'), pluginExtensions: string[]) {
	return (
		containingFile: string,
		file: ts.SourceFile,
		usage: ts.StringLiteralLike,
		compilerOptions: ts.CompilerOptions,
		packageJsonInfoCache: ts.PackageJsonInfoCache,
		host: ts.ModuleResolutionHost,
	) => {
		if (file.impliedNodeFormat !== undefined || !pluginExtensions.some(ext => containingFile.endsWith(ext))) {
			return ts.getModeForUsageLocation(file, usage, compilerOptions);
		}
		try {
			file.impliedNodeFormat = lookupFromPackageJson(
				containingFile,
				packageJsonInfoCache,
				host,
				compilerOptions,
			);
			return ts.getModeForUsageLocation(file, usage, compilerOptions);
		}
		finally {
			file.impliedNodeFormat = undefined;
		}
	};

	// https://github.com/microsoft/TypeScript/blob/669c25c091ad4d32298d0f33b0e4e681d46de3ea/src/compiler/program.ts#L1357
	function lookupFromPackageJson(
		fileName: string,
		packageJsonInfoCache: ts.PackageJsonInfoCache,
		host: ts.ModuleResolutionHost,
		options: ts.CompilerOptions,
	): ts.ResolutionMode {
		const { getTemporaryModuleResolutionState, getPackageScopeForPath, getDirectoryPath } = ts as any;
		const state = getTemporaryModuleResolutionState(packageJsonInfoCache, host, options);
		const packageJsonLocations: string[] = [];
		state.failedLookupLocations = packageJsonLocations;
		state.affectingLocations = packageJsonLocations;
		const packageJsonScope = getPackageScopeForPath(getDirectoryPath(fileName), state);
		const impliedNodeFormat = packageJsonScope?.contents.packageJsonContent.type === 'module'
			? ts.ModuleKind.ESNext
			: ts.ModuleKind.CommonJS;
		return impliedNodeFormat;
	}
}
