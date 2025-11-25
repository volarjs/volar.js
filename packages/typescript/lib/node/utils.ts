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

export function fixupImpliedNodeFormatForFile(
	ts: typeof import('typescript'),
	pluginExtensions: string[],
	sourceFile: ts.SourceFile,
	packageJsonInfoCache: ts.PackageJsonInfoCache,
	host: ts.ModuleResolutionHost,
	options: ts.CompilerOptions,
) {
	if (sourceFile.impliedNodeFormat !== undefined || !pluginExtensions.some(ext => sourceFile.fileName.endsWith(ext))) {
		return;
	}
	// https://github.com/microsoft/TypeScript/blob/669c25c091ad4d32298d0f33b0e4e681d46de3ea/src/compiler/program.ts#L1354
	const validExts = ['.d.ts', '.ts', '.tsx', '.js', '.jsx'];
	if (validExts.some(ext => sourceFile.fileName.endsWith(ext))) {
		return;
	}
	const asTs = sourceFile.fileName + '.ts';
	// Use getImpliedNodeFormatForFileWorker instead of getImpliedNodeFormatForFile for runTsc() compatibility
	const impliedNodeFormat = (ts as any).getImpliedNodeFormatForFileWorker?.(
		asTs,
		packageJsonInfoCache,
		host,
		options,
	)?.impliedNodeFormat;
	if (impliedNodeFormat === undefined) {
		return;
	}
	sourceFile.impliedNodeFormat = impliedNodeFormat;
	return () => sourceFile.impliedNodeFormat = undefined;
}
