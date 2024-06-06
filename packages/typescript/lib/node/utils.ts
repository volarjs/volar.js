import type { CodeInformation, Language, SourceMap, SourceScript, TypeScriptServiceScript } from '@volar/language-core';

export function notEmpty<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}

export function getServiceScript(language: Language<string>, fileName: string)
	: [TypeScriptServiceScript, SourceScript<string>, SourceMap<CodeInformation>]
	| [undefined, SourceScript<string>, undefined]
	| [undefined, undefined, undefined] {
	let sourceScript = language.scripts.get(fileName);
	if (sourceScript?.targetIds && sourceScript?.targetIds.size > 0) {
		const sourceId = sourceScript.id
		for (const targetId of sourceScript.targetIds) {
			sourceScript = language.scripts.get(targetId)
			if (sourceScript?.generated) {
				const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
				if (serviceScript) {
					for (const [id, _snapshot, map] of language.maps.forEach(serviceScript.code)) {
						if (id === sourceId) {
							return [serviceScript, sourceScript, map] as const
						}
					}
					break;
				}
			}
		}
	}
	if (sourceScript?.associatedOnly) {
		return [undefined, sourceScript, undefined]
	}
	if (sourceScript?.generated) {
		const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
		if (serviceScript) {
			const map = language.maps.get(serviceScript.code);
			if (map) {
				return [serviceScript, sourceScript, map] as const;
			}
		}
	}
	return [undefined, undefined, undefined] as const;
}
