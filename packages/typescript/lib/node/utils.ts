import type { FileRegistry } from '@volar/language-core';

export function notEmpty<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}

export function getVirtualFileAndMap(files: FileRegistry, fileName: string) {
	const sourceFile = files.get(fileName);
	if (sourceFile?.generated) {
		const tsFile = sourceFile.generated.languagePlugin.typescript?.getLanguageServiceFile(sourceFile.generated.code);
		if (tsFile) {
			for (const map of files.getMaps(tsFile.code)) {
				if (map[1][0] === sourceFile.snapshot) {
					return [tsFile, sourceFile, map[1][1]] as const;
				}
			}
		}
	}
	return [undefined, undefined, undefined] as const;
}
