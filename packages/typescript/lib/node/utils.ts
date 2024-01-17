import type { FileRegistry } from '@volar/language-core';

export function notEmpty<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}

export function getVirtualFileAndMap(files: FileRegistry, fileName: string) {
	const sourceFile = files.get(fileName);
	if (sourceFile?.generated) {
		const script = sourceFile.generated.languagePlugin.typescript?.getScript(sourceFile.generated.code);
		if (script) {
			for (const map of files.getMaps(script.code)) {
				if (map[1][0] === sourceFile.snapshot) {
					return [script, sourceFile, map[1][1]] as const;
				}
			}
		}
	}
	return [undefined, undefined, undefined] as const;
}
