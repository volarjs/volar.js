import type { Language } from '@volar/language-core';

export function notEmpty<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}

export function getServiceScript(language: Language<string>, fileName: string) {
	const sourceScript = language.scripts.get(fileName);
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
