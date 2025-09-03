import type { Language, SourceScript } from '@volar/language-core';
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
